package az.cci.scan.importing;

import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.StoreRepository;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class TransactionIngestionAnalyzer {

    private final CloudSaleWorkbookAdapter cloudSaleAdapter;
    private final List<TransactionFileParser> parsers;
    private final TransactionRowMapper rowMapper;
    private final StoreRepository storeRepository;

    public TransactionIngestionAnalyzer(
        CloudSaleWorkbookAdapter cloudSaleAdapter,
        List<TransactionFileParser> parsers,
        TransactionRowMapper rowMapper,
        StoreRepository storeRepository
    ) {
        this.cloudSaleAdapter = cloudSaleAdapter;
        this.parsers = parsers;
        this.rowMapper = rowMapper;
        this.storeRepository = storeRepository;
    }

    public IngestionAnalysis analyze(
        Retailer retailer,
        ImportProfile profile,
        String filename,
        byte[] bytes
    ) {
        return analyze(retailer, profile, filename, bytes, false);
    }

    public IngestionAnalysis analyzeForPreview(
        Retailer retailer,
        ImportProfile profile,
        String filename,
        byte[] bytes
    ) {
        return analyze(retailer, profile, filename, bytes, true);
    }

    private IngestionAnalysis analyze(
        Retailer retailer,
        ImportProfile profile,
        String filename,
        byte[] bytes,
        boolean requireRegisteredStores
    ) {
        IngestionAnalysis analysis = cloudSaleAdapter.analyze(filename, bytes, profile)
            .orElseGet(() -> generic(profile, filename, bytes));
        if (!analysis.errors().isEmpty()) {
            return analysis;
        }
        List<String> errors = new ArrayList<>();
        if (requireRegisteredStores) {
            Set<String> registeredStores = storeRepository.findAllByRetailerOrderByCreatedAtAsc(retailer)
                .stream().map(store -> store.getExternalStoreId()).collect(java.util.stream.Collectors.toSet());
            analysis.lines().stream().map(ParsedTransactionLine::storeId).distinct().sorted()
                .filter(storeId -> !registeredStores.contains(storeId))
                .forEach(storeId -> errors.add(
                    "store_id: " + storeId + " is not registered for this retailer"
                ));
        }

        for (ParsedTransactionLine line : analysis.lines()) {
            java.math.BigDecimal calculated = line.quantity().multiply(line.unitPrice())
                .subtract(line.discountAmount()).setScale(2, RoundingMode.HALF_UP);
            if (calculated.compareTo(line.lineTotal().setScale(2, RoundingMode.HALF_UP)) != 0) {
                errors.add("row " + line.sourceRowNumber() + ": line total does not equal quantity × unit price − discount");
            }
        }
        if (!errors.isEmpty()) {
            return new IngestionAnalysis(
                analysis.adapterCode(), analysis.adapterName(), analysis.sourceRows(),
                analysis.sourceHeaders(), analysis.adapterMappings(), List.of(),
                errors.stream().limit(100).toList()
            );
        }
        return analysis;
    }

    private IngestionAnalysis generic(ImportProfile profile, String filename, byte[] bytes) {
        TransactionFileParser parser = parsers.stream().filter(candidate -> candidate.supports(filename))
            .findFirst().orElse(null);
        if (parser == null) {
            return new IngestionAnalysis(
                "UNSUPPORTED", "No matching adapter", 0, Set.of(), Map.of(), List.of(),
                List.of("file: only .csv, .xls, and .xlsx files are supported")
            );
        }
        try {
            ParsedTable table = parser.parse(new ByteArrayInputStream(bytes), profile);
            RowMappingResult mapping = rowMapper.map(table, profile);
            Map<String, String> mappings = new LinkedHashMap<>();
            mappings.put("storeId", profile.getStoreIdColumn());
            mappings.put("receiptId", profile.getReceiptIdColumn());
            mappings.put("timestamp", profile.getTimestampColumn());
            mappings.put("productCode", profile.getProductCodeColumn());
            mappings.put("barcode", profile.getBarcodeColumn());
            mappings.put("productName", profile.getProductNameColumn());
            mappings.put("quantity", profile.getQuantityColumn());
            mappings.put("unitPrice", profile.getUnitPriceColumn());
            mappings.put("discountAmount", profile.getDiscountAmountColumn());
            mappings.put("lineTotal", profile.getLineTotalColumn());
            return new IngestionAnalysis(
                "COLUMN_MAPPING",
                "Saved column mapping",
                table.rows().size(),
                table.headers(),
                mappings,
                mapping.errors().isEmpty() ? mapping.lines() : List.of(),
                mapping.errors().stream().map(ImportValidationError::toString).toList()
            );
        } catch (IOException | RuntimeException exception) {
            String message = exception.getMessage();
            return new IngestionAnalysis(
                "COLUMN_MAPPING", "Saved column mapping", 0, Set.of(), Map.of(), List.of(),
                List.of(message == null || message.isBlank() ? "file: unable to read the file" : message)
            );
        }
    }
}
