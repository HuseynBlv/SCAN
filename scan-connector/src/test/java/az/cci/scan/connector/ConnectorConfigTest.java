package az.cci.scan.connector;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ConnectorConfigTest {

    @Test
    void readsSafeDefaultsAndNormalizesTheApiUrl() {
        ConnectorConfig config = ConnectorConfig.fromEnvironment(Map.of(
            "SCAN_API_URL", "https://scan.example.test/",
            "SCAN_CONNECTOR_PASSWORD", "secret"
        ));

        assertEquals("https://scan.example.test", config.apiBaseUrl().toString());
        assertEquals("scan-connector", config.username());
        assertEquals(15, config.pollInterval().toSeconds());
        assertEquals(10, config.stableAge().toSeconds());
    }

    @Test
    void refusesToStartWithoutAConnectorPassword() {
        IllegalArgumentException exception = assertThrows(
            IllegalArgumentException.class,
            () -> ConnectorConfig.fromEnvironment(Map.of())
        );

        assertEquals("SCAN_CONNECTOR_PASSWORD must be configured", exception.getMessage());
    }

    @Test
    void rejectsUnsafeOrInvalidConfiguration() {
        Map<String, String> environment = new HashMap<>();
        environment.put("SCAN_CONNECTOR_PASSWORD", "secret");
        environment.put("SCAN_API_URL", "file:///tmp/scan");
        assertThrows(IllegalArgumentException.class, () -> ConnectorConfig.fromEnvironment(environment));

        environment.put("SCAN_API_URL", "https://scan.example.test");
        environment.put("SCAN_CONNECTOR_POLL_SECONDS", "0");
        assertThrows(IllegalArgumentException.class, () -> ConnectorConfig.fromEnvironment(environment));
    }

    @Test
    void loadsAProtectedPropertiesFileAndLetsEnvironmentOverrideIt() throws Exception {
        java.nio.file.Path file = java.nio.file.Files.createTempFile("scan-connector", ".properties");
        try {
            java.nio.file.Files.writeString(file, """
                SCAN_API_URL=https://from-file.example.test
                SCAN_CONNECTOR_USERNAME=file-user
                SCAN_CONNECTOR_PASSWORD=file-password
                """);

            ConnectorConfig config = ConnectorConfig.fromSources(
                Map.of("SCAN_CONNECTOR_USERNAME", "environment-user"),
                file
            );

            assertEquals("https://from-file.example.test", config.apiBaseUrl().toString());
            assertEquals("environment-user", config.username());
            assertEquals("file-password", config.password());
        } finally {
            java.nio.file.Files.deleteIfExists(file);
        }
    }
}
