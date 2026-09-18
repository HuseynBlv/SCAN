package az.cci.scan.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Locale;
import java.util.Set;

@ConfigurationProperties(prefix = "scan.runtime")
public record RuntimeEnvironmentProperties(String environment, String databaseId) {

    private static final Set<String> VALID = Set.of("development", "test", "demo", "production");

    public RuntimeEnvironmentProperties {
        environment = environment == null ? "development" : environment.trim().toLowerCase(Locale.ROOT);
        databaseId = databaseId == null ? "local" : databaseId.trim();
        if (!VALID.contains(environment)) {
            throw new IllegalArgumentException("SCAN runtime environment is invalid");
        }
        if (databaseId.isBlank()) {
            throw new IllegalArgumentException("SCAN database ID is required");
        }
        if (environment.equals("production") && databaseId.equals("local")) {
            throw new IllegalArgumentException("Production requires an explicit SCAN_DATABASE_ID");
        }
    }
}
