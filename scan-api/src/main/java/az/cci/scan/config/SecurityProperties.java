package az.cci.scan.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;

@ConfigurationProperties(prefix = "scan.security")
public record SecurityProperties(
    String adminUsername,
    String adminPassword,
    String cciUsername,
    String cciPassword,
    String ingestUsername,
    String ingestPassword,
    String retailerUsername,
    String retailerPassword,
    String onboardingUsername,
    String onboardingPassword,
    boolean bootstrapEnabled
) {

    public SecurityProperties {
        adminUsername = normalized(adminUsername, "admin-username");
        cciUsername = normalized(cciUsername, "cci-username");
        ingestUsername = normalized(ingestUsername, "ingest-username");
        retailerUsername = normalized(retailerUsername, "retailer-username");
        onboardingUsername = normalized(onboardingUsername, "onboarding-username");
        requireSecret(adminPassword, "admin-password");
        requireSecret(cciPassword, "cci-password");
        requireSecret(ingestPassword, "ingest-password");
        requireSecret(retailerPassword, "retailer-password");
        List<String> usernames = new java.util.ArrayList<>(List.of(
            adminUsername,
            cciUsername,
            ingestUsername,
            retailerUsername
        ));
        if (onboardingEnabled(onboardingPassword)) {
            usernames.add(onboardingUsername);
        }
        if (new HashSet<>(usernames).size() != usernames.size()) {
            throw new IllegalArgumentException("SCAN account usernames must be distinct");
        }
    }

    public boolean onboardingEnabled() {
        return onboardingEnabled(onboardingPassword);
    }

    private static boolean onboardingEnabled(String password) {
        return password != null && !password.isBlank();
    }

    private static String normalized(String value, String property) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("scan.security." + property + " must be configured");
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private static void requireSecret(String value, String property) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("scan.security." + property + " must be configured");
        }
    }
}
