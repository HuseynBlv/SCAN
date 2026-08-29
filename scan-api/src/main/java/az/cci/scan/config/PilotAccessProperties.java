package az.cci.scan.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "scan.pilot")
public record PilotAccessProperties(
    String retailerCode,
    String profileCode
) {

    public PilotAccessProperties {
        if (retailerCode == null || retailerCode.isBlank()) {
            throw new IllegalArgumentException("scan.pilot.retailer-code must be configured");
        }
        if (profileCode == null || profileCode.isBlank()) {
            throw new IllegalArgumentException("scan.pilot.profile-code must be configured");
        }
        retailerCode = retailerCode.trim().toUpperCase();
        profileCode = profileCode.trim().toUpperCase();
    }
}
