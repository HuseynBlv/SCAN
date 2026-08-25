package az.cci.scan.importing;

import java.math.BigDecimal;
import java.time.Instant;

public record ParsedTransactionLine(
    int sourceRowNumber,
    String storeId,
    String receiptId,
    Instant transactionTimestamp,
    String productCode,
    String barcode,
    String productName,
    BigDecimal quantity,
    BigDecimal unitPrice,
    BigDecimal discountAmount,
    BigDecimal lineTotal
) {
    public String productKey() {
        if (productCode != null && !productCode.isBlank()) {
            return "CODE:" + productCode.trim();
        }
        if (barcode != null && !barcode.isBlank()) {
            return "BARCODE:" + barcode.trim();
        }
        return "NAME:" + productName.trim().toUpperCase();
    }
}
