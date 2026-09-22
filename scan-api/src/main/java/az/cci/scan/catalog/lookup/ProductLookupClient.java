package az.cci.scan.catalog.lookup;

import java.util.Optional;

/**
 * Looks up a product by barcode against an external, retailer-agnostic reference database, so a
 * product SCAN has never seen before can still resolve automatically instead of sitting unresolved
 * until an operator maps it by hand.
 *
 * Implementations must never throw: a lookup failure (not found, network error, timeout) is an
 * empty result, not an exception. An import must complete normally whether or not the lookup
 * service is reachable.
 */
public interface ProductLookupClient {
    Optional<ExternalProductMatch> lookup(String barcode);
}
