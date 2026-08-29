package az.cci.scan.connector;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

record ConnectorConfig(
    URI apiBaseUrl,
    String username,
    String password,
    Path workDirectory,
    Duration pollInterval,
    Duration stableAge,
    Duration requestTimeout,
    Duration maxRetryDelay
) {

    static ConnectorConfig fromEnvironment(Map<String, String> environment) {
        String apiUrl = value(environment, "SCAN_API_URL", "http://localhost:8080");
        String username = value(environment, "SCAN_CONNECTOR_USERNAME", "scan-connector");
        String password = required(environment, "SCAN_CONNECTOR_PASSWORD");
        Path workDirectory = Path.of(value(environment, "SCAN_CONNECTOR_DIRECTORY", "scan-data"))
            .toAbsolutePath()
            .normalize();

        return new ConnectorConfig(
            normalizedBaseUri(apiUrl),
            username,
            password,
            workDirectory,
            positiveSeconds(environment, "SCAN_CONNECTOR_POLL_SECONDS", 15),
            nonNegativeSeconds(environment, "SCAN_CONNECTOR_STABLE_SECONDS", 10),
            positiveSeconds(environment, "SCAN_CONNECTOR_TIMEOUT_SECONDS", 120),
            positiveSeconds(environment, "SCAN_CONNECTOR_MAX_RETRY_SECONDS", 300)
        );
    }

    static ConnectorConfig fromSources(Map<String, String> environment, Path propertiesFile) throws IOException {
        if (propertiesFile == null) {
            return fromEnvironment(environment);
        }
        if (!Files.isRegularFile(propertiesFile)) {
            throw new IllegalArgumentException("Connector configuration file does not exist: " + propertiesFile);
        }
        Properties properties = new Properties();
        try (InputStream input = Files.newInputStream(propertiesFile)) {
            properties.load(input);
        }
        Map<String, String> merged = new HashMap<>();
        properties.stringPropertyNames().forEach(key -> merged.put(key, properties.getProperty(key)));
        environment.forEach((key, value) -> {
            if (value != null && !value.isBlank()) {
                merged.put(key, value);
            }
        });
        return fromEnvironment(merged);
    }

    Path inboxDirectory() {
        return workDirectory.resolve("inbox");
    }

    Path processedDirectory() {
        return workDirectory.resolve("processed");
    }

    Path failedDirectory() {
        return workDirectory.resolve("failed");
    }

    Path statusFile() {
        return workDirectory.resolve("connector-status.json");
    }

    private static URI normalizedBaseUri(String value) {
        URI uri = URI.create(value.trim());
        if (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("SCAN_API_URL must use http or https");
        }
        String normalized = uri.toString();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return URI.create(normalized);
    }

    private static Duration positiveSeconds(
        Map<String, String> environment,
        String key,
        long defaultValue
    ) {
        long seconds = parseLong(value(environment, key, Long.toString(defaultValue)), key);
        if (seconds <= 0) {
            throw new IllegalArgumentException(key + " must be greater than zero");
        }
        return Duration.ofSeconds(seconds);
    }

    private static Duration nonNegativeSeconds(
        Map<String, String> environment,
        String key,
        long defaultValue
    ) {
        long seconds = parseLong(value(environment, key, Long.toString(defaultValue)), key);
        if (seconds < 0) {
            throw new IllegalArgumentException(key + " must not be negative");
        }
        return Duration.ofSeconds(seconds);
    }

    private static long parseLong(String value, String key) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(key + " must be a whole number", exception);
        }
    }

    private static String required(Map<String, String> environment, String key) {
        String value = environment.get(key);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(key + " must be configured");
        }
        return value;
    }

    private static String value(Map<String, String> environment, String key, String fallback) {
        String value = environment.get(key);
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
