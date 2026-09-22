package az.cci.scan.catalog.lookup;

/**
 * A product found by an external barcode lookup, already classified against the CCI brand list.
 * {@code cci} is decided here (by {@link CciBrandCatalog}), not left for a caller to guess, so every
 * caller applies the same rule.
 */
public record ExternalProductMatch(
    String normalizedName,
    String brand,
    String category,
    boolean cci
) {
}
