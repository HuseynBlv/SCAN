package az.cci.scan.connector;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

final class InboxProcessor {

    private static final Set<String> SUPPORTED_EXTENSIONS = Set.of("csv", "xls", "xlsx");
    private static final DateTimeFormatter ARCHIVE_TIME = DateTimeFormatter
        .ofPattern("yyyyMMdd-HHmmss-SSS")
        .withZone(ZoneOffset.UTC);

    private final ConnectorConfig config;
    private final ImportClient importClient;
    private final Clock clock;
    private final ObjectMapper objectMapper;
    private final Map<Path, RetryState> retries = new HashMap<>();
    private final Map<Path, FileObservation> observations = new HashMap<>();

    InboxProcessor(ConnectorConfig config, ImportClient importClient) {
        this(config, importClient, Clock.systemUTC(), new ObjectMapper());
    }

    InboxProcessor(
        ConnectorConfig config,
        ImportClient importClient,
        Clock clock,
        ObjectMapper objectMapper
    ) {
        this.config = config;
        this.importClient = importClient;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    void initialize() throws IOException {
        Files.createDirectories(config.inboxDirectory());
        Files.createDirectories(config.processedDirectory());
        Files.createDirectories(config.failedDirectory());
        writeStatus("READY", null, "Waiting for retailer exports", null);
    }

    ProcessingSummary processOnce() throws IOException {
        Instant now = clock.instant();
        List<Path> files;
        try (var paths = Files.list(config.inboxDirectory())) {
            files = paths
                .filter(Files::isRegularFile)
                .filter(this::supported)
                .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                .toList();
        }

        int uploaded = 0;
        int failed = 0;
        int deferred = 0;
        for (Path file : files) {
            if (!ready(file, now) || waitingForRetry(file, now)) {
                deferred++;
                continue;
            }
            ProcessingOutcome outcome = process(file, now);
            if (outcome == ProcessingOutcome.UPLOADED) {
                uploaded++;
            } else if (outcome == ProcessingOutcome.FAILED) {
                failed++;
            } else {
                deferred++;
            }
        }
        return new ProcessingSummary(files.size(), uploaded, failed, deferred);
    }

    private ProcessingOutcome process(Path file, Instant now) throws IOException {
        try {
            ImportClient.UploadResult result = importClient.upload(file);
            if (result.successful()) {
                Path archived = moveUniquely(file, config.processedDirectory(), now);
                retries.remove(file);
                observations.remove(file);
                writeStatus("SYNCED", archived.getFileName().toString(), safeMessage(result.responseBody()), result.statusCode());
                System.out.printf("Uploaded %s (HTTP %d)%n", file.getFileName(), result.statusCode());
                return ProcessingOutcome.UPLOADED;
            }
            if (result.retryable()) {
                scheduleRetry(file, now, "HTTP " + result.statusCode() + ": " + safeMessage(result.responseBody()));
                return ProcessingOutcome.DEFERRED;
            }
            failPermanently(file, now, "HTTP " + result.statusCode() + ": " + safeMessage(result.responseBody()));
            return ProcessingOutcome.FAILED;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            scheduleRetry(file, now, "Upload interrupted");
            return ProcessingOutcome.DEFERRED;
        } catch (IOException | RuntimeException exception) {
            scheduleRetry(file, now, safeMessage(exception.getMessage()));
            return ProcessingOutcome.DEFERRED;
        }
    }

    private void scheduleRetry(Path file, Instant now, String message) throws IOException {
        RetryState previous = retries.get(file);
        int failures = previous == null ? 1 : previous.failures() + 1;
        long exponentialSeconds = Math.min(
            config.maxRetryDelay().toSeconds(),
            Math.max(config.pollInterval().toSeconds(), 1L << Math.min(failures - 1, 20))
        );
        Instant nextAttempt = now.plusSeconds(exponentialSeconds);
        retries.put(file, new RetryState(failures, nextAttempt));
        writeStatus(
            "RETRYING",
            file.getFileName().toString(),
            message + "; next attempt after " + nextAttempt,
            null
        );
        System.err.printf("Upload deferred for %s: %s%n", file.getFileName(), message);
    }

    private void failPermanently(Path file, Instant now, String message) throws IOException {
        Path failed = moveUniquely(file, config.failedDirectory(), now);
        Path errorFile = failed.resolveSibling(failed.getFileName() + ".error.txt");
        Files.writeString(errorFile, message + System.lineSeparator(), StandardCharsets.UTF_8);
        retries.remove(file);
        observations.remove(file);
        writeStatus("FAILED", failed.getFileName().toString(), message, null);
        System.err.printf("Rejected %s: %s%n", file.getFileName(), message);
    }

    private boolean ready(Path file, Instant now) throws IOException {
        Instant lastModified = Files.getLastModifiedTime(file).toInstant();
        long size = Files.size(file);
        if (size == 0 || lastModified.plus(config.stableAge()).isAfter(now)) {
            observations.remove(file);
            return false;
        }
        if (config.stableAge().isZero()) {
            return true;
        }
        FileObservation current = new FileObservation(size, lastModified);
        FileObservation previous = observations.put(file, current);
        return current.equals(previous);
    }

    private boolean waitingForRetry(Path file, Instant now) {
        RetryState retry = retries.get(file);
        return retry != null && retry.nextAttempt().isAfter(now);
    }

    private boolean supported(Path path) {
        String name = path.getFileName().toString();
        int dot = name.lastIndexOf('.');
        return dot > 0 && SUPPORTED_EXTENSIONS.contains(name.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    private Path moveUniquely(Path source, Path destinationDirectory, Instant now) throws IOException {
        String timestamp = ARCHIVE_TIME.format(now);
        String originalName = source.getFileName().toString();
        Path destination = destinationDirectory.resolve(timestamp + "-" + originalName);
        int suffix = 1;
        while (Files.exists(destination)) {
            destination = destinationDirectory.resolve(timestamp + "-" + suffix + "-" + originalName);
            suffix++;
        }
        try {
            return Files.move(source, destination, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException exception) {
            return Files.move(source, destination);
        }
    }

    private void writeStatus(String state, String filename, String message, Integer httpStatus) throws IOException {
        Map<String, Object> status = new java.util.LinkedHashMap<>();
        status.put("state", state);
        status.put("updatedAt", clock.instant().toString());
        status.put("filename", filename);
        status.put("message", safeMessage(message));
        status.put("httpStatus", httpStatus);
        Path temporary = config.statusFile().resolveSibling(config.statusFile().getFileName() + ".tmp");
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(temporary.toFile(), status);
        try {
            Files.move(
                temporary,
                config.statusFile(),
                StandardCopyOption.REPLACE_EXISTING,
                StandardCopyOption.ATOMIC_MOVE
            );
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(temporary, config.statusFile(), StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private String safeMessage(String message) {
        if (message == null || message.isBlank()) {
            return "No response details";
        }
        String normalized = message.replaceAll("[\\r\\n]+", " ").trim();
        return normalized.length() <= 1000 ? normalized : normalized.substring(0, 1000);
    }

    record ProcessingSummary(int discovered, int uploaded, int failed, int deferred) {
    }

    private record RetryState(int failures, Instant nextAttempt) {
    }

    private record FileObservation(long size, Instant lastModified) {
    }

    private enum ProcessingOutcome {
        UPLOADED,
        FAILED,
        DEFERRED
    }
}
