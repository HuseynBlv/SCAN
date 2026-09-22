package az.cci.scan.catalog.lookup;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * scan.product-lookup.enabled can be turned off without a code change - for example to keep a live
 * demo's timing predictable, or to run fully offline - in which case products fall back to the
 * existing manual-mapping workflow exactly as before this feature existed.
 */
@ConfigurationProperties(prefix = "scan.product-lookup")
public record ProductLookupProperties(
    @DefaultValue("true") boolean enabled,
    @DefaultValue("3s") Duration timeout
) {
}
