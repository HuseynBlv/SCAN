package az.cci.scan.connector;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InboxProcessorTest {

    private static final Instant NOW = Instant.parse("2026-08-30T12:00:00Z");

    @TempDir
    Path temporaryDirectory;

    @Test
    void archivesSuccessfullyUploadedFilesAndWritesStatus() throws Exception {
        InboxProcessor processor = processor(file -> new ImportClient.UploadResult(201, "{\"status\":\"COMPLETED\"}"));
        processor.initialize();
        Path export = writeExport("transactions.csv");

        InboxProcessor.ProcessingSummary summary = processor.processOnce();

        assertEquals(1, summary.uploaded());
        assertFalse(Files.exists(export));
        assertEquals(1, regularFiles(config().processedDirectory()));
        assertTrue(Files.readString(config().statusFile()).contains("SYNCED"));
    }

    @Test
    void leavesRetryableFailuresInTheInbox() throws Exception {
        AtomicInteger attempts = new AtomicInteger();
        InboxProcessor processor = processor(file -> {
            attempts.incrementAndGet();
            return new ImportClient.UploadResult(503, "temporarily unavailable");
        });
        processor.initialize();
        Path export = writeExport("transactions.xlsx");

        InboxProcessor.ProcessingSummary first = processor.processOnce();
        InboxProcessor.ProcessingSummary second = processor.processOnce();

        assertEquals(1, first.deferred());
        assertEquals(1, second.deferred());
        assertEquals(1, attempts.get());
        assertTrue(Files.exists(export));
        assertTrue(Files.readString(config().statusFile()).contains("RETRYING"));
    }

    @Test
    void quarantinesPermanentValidationFailuresWithAnErrorSidecar() throws Exception {
        InboxProcessor processor = processor(file -> new ImportClient.UploadResult(422, "invalid receipt id"));
        processor.initialize();
        Path export = writeExport("bad.csv");

        InboxProcessor.ProcessingSummary summary = processor.processOnce();

        assertEquals(1, summary.failed());
        assertFalse(Files.exists(export));
        assertEquals(2, regularFiles(config().failedDirectory()));
        assertTrue(Files.list(config().failedDirectory())
            .filter(path -> path.getFileName().toString().endsWith(".error.txt"))
            .anyMatch(path -> read(path).contains("invalid receipt id")));
    }

    @Test
    void ignoresTemporaryAndUnsupportedFiles() throws Exception {
        InboxProcessor processor = processor(file -> {
            throw new AssertionError("unsupported files must not be uploaded");
        });
        processor.initialize();
        Files.writeString(config().inboxDirectory().resolve("export.tmp"), "still writing");
        Files.writeString(config().inboxDirectory().resolve("notes.txt"), "not an export");

        InboxProcessor.ProcessingSummary summary = processor.processOnce();

        assertEquals(0, summary.discovered());
        assertEquals(2, regularFiles(config().inboxDirectory()));
    }

    @Test
    void defersEmptyFilesBecauseTheyMayStillBeWritten() throws Exception {
        InboxProcessor processor = processor(file -> {
            throw new AssertionError("empty files must not be uploaded");
        });
        processor.initialize();
        Path export = Files.createFile(config().inboxDirectory().resolve("empty.csv"));

        InboxProcessor.ProcessingSummary summary = processor.processOnce();

        assertEquals(1, summary.deferred());
        assertTrue(Files.exists(export));
    }

    @Test
    void requiresTwoUnchangedObservationsBeforeUploadingAStableAgedFile() throws Exception {
        AtomicInteger uploads = new AtomicInteger();
        ConnectorConfig stableConfig = new ConnectorConfig(
            URI.create("https://scan.example.test"),
            "connector",
            "secret",
            temporaryDirectory,
            Duration.ofSeconds(15),
            Duration.ofSeconds(10),
            Duration.ofSeconds(120),
            Duration.ofMinutes(5)
        );
        InboxProcessor processor = new InboxProcessor(
            stableConfig,
            file -> {
                uploads.incrementAndGet();
                return new ImportClient.UploadResult(201, "completed");
            },
            Clock.fixed(NOW, ZoneOffset.UTC),
            new ObjectMapper()
        );
        processor.initialize();
        Path export = Files.writeString(stableConfig.inboxDirectory().resolve("changing.csv"), "first");
        Files.setLastModifiedTime(export, FileTime.from(NOW.minusSeconds(20)));

        assertEquals(1, processor.processOnce().deferred());
        Files.writeString(export, "changed and longer");
        Files.setLastModifiedTime(export, FileTime.from(NOW.minusSeconds(20)));
        assertEquals(1, processor.processOnce().deferred());
        assertEquals(1, processor.processOnce().uploaded());
        assertEquals(1, uploads.get());
    }

    private InboxProcessor processor(ImportClient client) {
        return new InboxProcessor(
            config(),
            client,
            Clock.fixed(NOW, ZoneOffset.UTC),
            new ObjectMapper()
        );
    }

    private ConnectorConfig config() {
        return new ConnectorConfig(
            URI.create("https://scan.example.test"),
            "connector",
            "secret",
            temporaryDirectory,
            Duration.ofSeconds(15),
            Duration.ZERO,
            Duration.ofSeconds(120),
            Duration.ofMinutes(5)
        );
    }

    private Path writeExport(String filename) throws IOException {
        return Files.writeString(config().inboxDirectory().resolve(filename), "receipt_id,product_code\n1,A\n");
    }

    private long regularFiles(Path directory) throws IOException {
        try (var files = Files.list(directory)) {
            return files.filter(Files::isRegularFile).count();
        }
    }

    private String read(Path path) {
        try {
            return Files.readString(path);
        } catch (IOException exception) {
            throw new AssertionError(exception);
        }
    }
}
