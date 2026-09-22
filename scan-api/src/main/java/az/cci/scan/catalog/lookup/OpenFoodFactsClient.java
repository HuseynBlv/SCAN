package az.cci.scan.catalog.lookup;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Locale;
import java.util.Optional;

/**
 * Looks up a barcode against Open Food Facts (world.openfoodfacts.org): free, no API key, no cost -
 * the only option that fits this project's $0 budget. It is a crowd-sourced database, so a returned
 * name can be in whatever language the original contributor used; callers show it for an operator to
 * confirm rather than trusting it silently. Coverage is strong for major international brands
 * (verified against this project's own CASPOS-pilot test data: Coca-Cola, Sprite, Fanta, Bonaqua,
 * and several third-party brands all resolved correctly) and weak for small local producers, who
 * fall back to the existing manual "Add as new SCAN product" flow untouched.
 */
@Component
public class OpenFoodFactsClient implements ProductLookupClient {

    private static final Logger log = LoggerFactory.getLogger(OpenFoodFactsClient.class);
    private static final String BASE_URL = "https://world.openfoodfacts.org";

    private final RestClient restClient;
    private final CciBrandCatalog brandCatalog;
    private final boolean enabled;

    public OpenFoodFactsClient(ProductLookupProperties properties, CciBrandCatalog brandCatalog) {
        this.brandCatalog = brandCatalog;
        this.enabled = properties.enabled();
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        int timeoutMillis = Math.toIntExact(properties.timeout().toMillis());
        requestFactory.setConnectTimeout(timeoutMillis);
        requestFactory.setReadTimeout(timeoutMillis);
        this.restClient = RestClient.builder()
            .baseUrl(BASE_URL)
            .requestFactory(requestFactory)
            .defaultHeader("User-Agent", "SCAN/1.0 (+https://github.com/HuseynBlv/SCAN)")
            .build();
    }

    @Override
    public Optional<ExternalProductMatch> lookup(String barcode) {
        if (!enabled || barcode == null || barcode.isBlank()) {
            return Optional.empty();
        }
        try {
            OpenFoodFactsResponse response = restClient.get()
                .uri("/api/v2/product/{barcode}.json?fields=status,product_name,brands,categories", barcode.trim())
                .retrieve()
                .body(OpenFoodFactsResponse.class);
            return toMatch(barcode, response);
        } catch (Exception exception) {
            // Never let a slow or unreachable third party fail an import; it just stays unresolved.
            log.info("Open Food Facts lookup skipped for barcode {}: {}", barcode, exception.getMessage());
            return Optional.empty();
        }
    }

    private Optional<ExternalProductMatch> toMatch(String barcode, OpenFoodFactsResponse response) {
        if (response == null || response.status() != 1 || response.product() == null) {
            return Optional.empty();
        }
        String name = response.product().productName();
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        String brands = response.product().brands();
        String category = mostSpecificCategory(response.product().categories());
        boolean cci = brandCatalog.isCciBrand(brands);
        return Optional.of(new ExternalProductMatch(name.trim(), blankToNull(brands), category, cci));
    }

    private String mostSpecificCategory(String rawCategories) {
        if (rawCategories == null || rawCategories.isBlank()) return null;
        String[] parts = rawCategories.split(",");
        String last = parts[parts.length - 1].trim();
        return last.isEmpty() ? null : capitalize(last);
    }

    private String capitalize(String value) {
        return value.substring(0, 1).toUpperCase(Locale.ROOT) + value.substring(1);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record OpenFoodFactsResponse(int status, OpenFoodFactsProduct product) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record OpenFoodFactsProduct(
        @JsonProperty("product_name") String productName,
        String brands,
        String categories
    ) {
    }
}
