package az.cci.scan.importing;

import az.cci.scan.domain.RetailerProduct;

import java.util.ArrayList;
import java.util.Locale;
import java.util.Map;

public final class ProductIdentity {

    private ProductIdentity() {
    }

    public static String productKey(String productCode, String barcode, String productName) {
        if (barcode != null && !barcode.isBlank()) {
            return barcodeKey(barcode);
        }
        if (productCode != null && !productCode.isBlank()) {
            return codeKey(productCode);
        }
        return nameKey(productName);
    }

    public static String codeKey(String productCode) {
        return "CODE:" + productCode.trim();
    }

    public static void addBarcodeAliases(Map<String, RetailerProduct> products) {
        // In-memory aliases preserve Phase 0 CODE keys and existing receipt references.
        for (RetailerProduct product : new ArrayList<>(products.values())) {
            if (product.getBarcode() == null || product.getBarcode().isBlank()) {
                continue;
            }
            String key = barcodeKey(product.getBarcode());
            RetailerProduct existing = products.get(key);
            if (existing != null && existing.isResolved() && product.isResolved()
                && !existing.getCanonicalProduct().getId().equals(product.getCanonicalProduct().getId())) {
                throw new IllegalArgumentException(
                    "Conflicting saved mappings for retailer barcode " + product.getBarcode()
                );
            }
            if (existing == null || (!existing.isResolved() && product.isResolved())
                || (existing.isResolved() == product.isResolved()
                    && product.getProductKey().compareTo(existing.getProductKey()) < 0)) {
                products.put(key, product);
            }
        }
    }

    private static String barcodeKey(String barcode) {
        return "BARCODE:" + barcode.trim();
    }

    private static String nameKey(String productName) {
        return "NAME:" + productName.trim().toUpperCase(Locale.ROOT);
    }
}
