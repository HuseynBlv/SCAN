package az.cci.scan.importing;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public record IngestionAnalysis(
    String adapterCode,
    String adapterName,
    int sourceRows,
    Set<String> sourceHeaders,
    Map<String, String> adapterMappings,
    List<ParsedTransactionLine> lines,
    List<String> errors
) {

    public IngestionAnalysis {
        sourceHeaders = Set.copyOf(sourceHeaders);
        adapterMappings = java.util.Collections.unmodifiableMap(new LinkedHashMap<>(adapterMappings));
        lines = List.copyOf(lines);
        errors = List.copyOf(errors);
    }

    public boolean valid() {
        return errors.isEmpty() && !lines.isEmpty();
    }

    public Reconciliation reconciliation() {
        BigDecimal quantity = BigDecimal.ZERO;
        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal discounts = BigDecimal.ZERO;
        BigDecimal reportedNet = BigDecimal.ZERO;
        BigDecimal calculatedNet = BigDecimal.ZERO;
        Instant first = null;
        Instant last = null;
        java.util.LinkedHashSet<String> stores = new java.util.LinkedHashSet<>();
        java.util.LinkedHashSet<String> receipts = new java.util.LinkedHashSet<>();
        java.util.LinkedHashSet<String> products = new java.util.LinkedHashSet<>();

        for (ParsedTransactionLine line : lines) {
            quantity = quantity.add(line.quantity());
            gross = gross.add(line.quantity().multiply(line.unitPrice()));
            discounts = discounts.add(line.discountAmount());
            reportedNet = reportedNet.add(line.lineTotal());
            calculatedNet = calculatedNet.add(
                line.quantity().multiply(line.unitPrice()).subtract(line.discountAmount())
                    .setScale(2, java.math.RoundingMode.HALF_UP)
            );
            stores.add(line.storeId());
            receipts.add(line.storeId() + "\u0000" + line.receiptId() + "\u0000" + line.transactionTimestamp());
            products.add(line.productKey());
            first = first == null || line.transactionTimestamp().isBefore(first)
                ? line.transactionTimestamp() : first;
            last = last == null || line.transactionTimestamp().isAfter(last)
                ? line.transactionTimestamp() : last;
        }
        return new Reconciliation(
            receipts.size(),
            lines.size(),
            products.size(),
            Set.copyOf(stores),
            quantity,
            gross,
            discounts,
            reportedNet,
            calculatedNet,
            calculatedNet.subtract(reportedNet),
            first,
            last
        );
    }

    public record Reconciliation(
        int receipts,
        int productLines,
        int distinctProducts,
        Set<String> storeIds,
        BigDecimal quantity,
        BigDecimal grossSales,
        BigDecimal discounts,
        BigDecimal reportedNetSales,
        BigDecimal calculatedNetSales,
        BigDecimal difference,
        Instant firstTransactionAt,
        Instant lastTransactionAt
    ) {
    }
}
