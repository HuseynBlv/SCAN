package az.cci.scan.tools.kaggle;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVPrinter;
import org.apache.commons.csv.CSVRecord;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.DateTimeException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import tools.jackson.databind.ObjectMapper;

public final class KaggleDatasetPreparer {

    public static final String TRANSACTIONS_FILENAME = "canonical-transactions.csv";
    public static final String CATALOG_FILENAME = "product-catalog.csv";
    public static final String REJECTIONS_FILENAME = "rejected-rows.csv";
    public static final String REPORT_FILENAME = "validation-report.json";

    private static final long MAX_UNCOMPRESSED_CSV_BYTES = 250L * 1024L * 1024L;
    private static final DateTimeFormatter SOURCE_TIMESTAMP = DateTimeFormatter.ofPattern(
        "dd/MM/uuuu HH:mm",
        Locale.ROOT
    );
    private static final DateTimeFormatter CANONICAL_TIMESTAMP = DateTimeFormatter.ofPattern(
        "uuuu-MM-dd'T'HH:mm:ss",
        Locale.ROOT
    );
    private static final List<String> REQUIRED_HEADERS = List.of(
        "satish_kodu",
        "mehsul_kodu",
        "mehsul_ad",
        "mehsul_kateqoriya",
        "mehsul_qiymet",
        "satish_tarixi",
        "endirim_kompaniya",
        "magaza_ad"
    );
    private static final String[] CANONICAL_HEADERS = {
        "store_id",
        "receipt_id",
        "transaction_timestamp",
        "product_code",
        "barcode",
        "product_name",
        "quantity",
        "unit_price",
        "discount_amount",
        "line_total"
    };
    private static final String[] CATALOG_HEADERS = {
        "source_product_name",
        "normalized_name",
        "barcode",
        "brand",
        "manufacturer",
        "category",
        "subcategory",
        "package_size",
        "package_type",
        "is_cci"
    };
    private static final String[] REJECTION_HEADERS = {
        "source_row_number",
        "store_id",
        "receipt_id",
        "reason"
    };
    private static final List<BrandRule> CCI_BRAND_RULES = List.of(
        new BrandRule("Coca-Cola", Pattern.compile("\\bCOCA[\\s-]*COLA\\b", Pattern.CASE_INSENSITIVE)),
        new BrandRule("Fanta", Pattern.compile("\\bFANTA\\b", Pattern.CASE_INSENSITIVE)),
        new BrandRule("Sprite", Pattern.compile("\\bSPRITE\\b", Pattern.CASE_INSENSITIVE)),
        new BrandRule("Cappy", Pattern.compile("\\bCAPPY\\b", Pattern.CASE_INSENSITIVE)),
        new BrandRule("Fuse Tea", Pattern.compile("\\bFUSE(?:\\s+TEA)?\\b", Pattern.CASE_INSENSITIVE)),
        new BrandRule("Burn", Pattern.compile("\\bBURN\\b", Pattern.CASE_INSENSITIVE)),
        new BrandRule("Bonaqua", Pattern.compile(
            "\\bBONAQUA\\b|\\bBON\\s+AQUA\\b",
            Pattern.CASE_INSENSITIVE
        ))
    );

    private final ObjectMapper objectMapper;

    public KaggleDatasetPreparer() {
        this(new ObjectMapper());
    }

    KaggleDatasetPreparer(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public PreparationResult prepare(Path inputZip, Path outputDirectory, int receiptLimit) {
        if (receiptLimit < 0) {
            throw new IllegalArgumentException("receiptLimit must be zero or greater");
        }
        if (!Files.isRegularFile(inputZip)) {
            throw new IllegalArgumentException("Input ZIP does not exist: " + inputZip);
        }

        try {
            Files.createDirectories(outputDirectory);
            try (ZipFile archive = new ZipFile(inputZip.toFile(), StandardCharsets.UTF_8)) {
                ZipEntry csvEntry = sourceCsvEntry(archive);
                SourceProfile source = profileSource(archive, csvEntry);
                Set<ReceiptKey> selectedReceipts = selectReceipts(source, receiptLimit);
                return writeOutputs(
                    inputZip,
                    outputDirectory,
                    archive,
                    csvEntry,
                    source,
                    selectedReceipts,
                    receiptLimit
                );
            }
        } catch (IOException exception) {
            throw new IllegalArgumentException("Unable to prepare Kaggle dataset: " + exception.getMessage(), exception);
        }
    }

    private ZipEntry sourceCsvEntry(ZipFile archive) {
        List<? extends ZipEntry> csvEntries = archive.stream()
            .filter(entry -> !entry.isDirectory())
            .filter(entry -> entry.getName().toLowerCase(Locale.ROOT).endsWith(".csv"))
            .toList();
        if (csvEntries.size() != 1) {
            throw new IllegalArgumentException("Expected exactly one CSV inside the ZIP");
        }
        ZipEntry entry = csvEntries.getFirst();
        if (entry.getSize() <= 0 || entry.getSize() > MAX_UNCOMPRESSED_CSV_BYTES) {
            throw new IllegalArgumentException("CSV uncompressed size is outside the supported range");
        }
        return entry;
    }

    private SourceProfile profileSource(ZipFile archive, ZipEntry csvEntry) throws IOException {
        Map<ReceiptKey, ReceiptState> receipts = new LinkedHashMap<>();
        Set<String> stores = new LinkedHashSet<>();
        Map<String, Set<String>> namesBySourceCode = new HashMap<>();
        Map<String, Long> promotionRows = new LinkedHashMap<>();
        List<RejectedRow> rejectedRows = new ArrayList<>();
        long[] totalRows = {0};

        readSource(archive, csvEntry, parser -> {
            validateHeaders(parser);
            for (CSVRecord record : parser) {
                totalRows[0]++;
                SourceRow sourceRow = parseSourceRow(record);
                ReceiptKey key = sourceRow.receiptKey();
                if (key != null) {
                    ReceiptState receipt = receipts.computeIfAbsent(key, ignored -> new ReceiptState());
                    receipt.totalRows++;
                    if (sourceRow.timestamp() != null) {
                        if (receipt.timestamp == null) {
                            receipt.timestamp = sourceRow.timestamp();
                        } else if (!receipt.timestamp.equals(sourceRow.timestamp())) {
                            sourceRow.errors().add("receipt contains multiple timestamps");
                        }
                    }
                }

                if (!sourceRow.errors().isEmpty()) {
                    if (key != null) {
                        receipts.get(key).invalid = true;
                    }
                    rejectedRows.add(new RejectedRow(
                        record.getRecordNumber() + 1,
                        sourceRow.storeId(),
                        sourceRow.receiptId(),
                        String.join("; ", sourceRow.errors())
                    ));
                    continue;
                }

                stores.add(sourceRow.storeId());
                namesBySourceCode.computeIfAbsent(sourceRow.sourceProductCode(), ignored -> new HashSet<>())
                    .add(sourceRow.productName());
                promotionRows.merge(sourceRow.promotionLabel(), 1L, Long::sum);
            }
        });

        long quarantinedRows = receipts.values().stream()
            .filter(receipt -> receipt.invalid)
            .mapToLong(receipt -> receipt.totalRows)
            .sum();
        long ambiguousCodes = namesBySourceCode.values().stream().filter(names -> names.size() > 1).count();
        return new SourceProfile(
            totalRows[0],
            receipts,
            stores,
            namesBySourceCode.size(),
            ambiguousCodes,
            promotionRows,
            rejectedRows,
            quarantinedRows
        );
    }

    private Set<ReceiptKey> selectReceipts(SourceProfile source, int receiptLimit) {
        List<ReceiptKey> eligible = source.receipts().entrySet().stream()
            .filter(entry -> !entry.getValue().invalid)
            .map(Map.Entry::getKey)
            .sorted(Comparator.comparing(this::sampleHash).thenComparing(ReceiptKey::stableValue))
            .toList();
        int selectedCount = receiptLimit == 0 ? eligible.size() : Math.min(receiptLimit, eligible.size());
        return new HashSet<>(eligible.subList(0, selectedCount));
    }

    private PreparationResult writeOutputs(
        Path inputZip,
        Path outputDirectory,
        ZipFile archive,
        ZipEntry csvEntry,
        SourceProfile source,
        Set<ReceiptKey> selectedReceipts,
        int receiptLimit
    ) throws IOException {
        Path transactionsTarget = outputDirectory.resolve(TRANSACTIONS_FILENAME);
        Path catalogTarget = outputDirectory.resolve(CATALOG_FILENAME);
        Path rejectionsTarget = outputDirectory.resolve(REJECTIONS_FILENAME);
        Path reportTarget = outputDirectory.resolve(REPORT_FILENAME);
        Path transactionsTemporary = temporarySibling(transactionsTarget);
        Path catalogTemporary = temporarySibling(catalogTarget);
        Path rejectionsTemporary = temporarySibling(rejectionsTarget);
        Path reportTemporary = temporarySibling(reportTarget);

        Map<String, ProductState> products = new LinkedHashMap<>();
        Set<ReceiptKey> cciReceipts = new HashSet<>();
        long[] outputLines = {0};
        long[] cciLines = {0};

        try {
            try (
                BufferedWriter writer = Files.newBufferedWriter(transactionsTemporary, StandardCharsets.UTF_8);
                CSVPrinter printer = CSVFormat.RFC4180.builder().setHeader(CANONICAL_HEADERS).get().print(writer)
            ) {
                readSource(archive, csvEntry, parser -> {
                    validateHeaders(parser);
                    for (CSVRecord record : parser) {
                        SourceRow row = parseSourceRow(record);
                        if (!row.errors().isEmpty() || !selectedReceipts.contains(row.receiptKey())) {
                            continue;
                        }
                        BrandMatch brand = brandMatch(row.productName());
                        String productIdentity = nameProductKey(row.productName());
                        ProductState product = products.computeIfAbsent(
                            productIdentity,
                            ignored -> new ProductState()
                        );
                        product.add(row.productName(), row.category(), brand);
                        if (brand.cci()) {
                            cciLines[0]++;
                            cciReceipts.add(row.receiptKey());
                        }
                        try {
                            printer.printRecord(
                                row.storeId(),
                                row.receiptId(),
                                CANONICAL_TIMESTAMP.format(row.timestamp()),
                                "",
                                "",
                                row.productName(),
                                "1",
                                row.unitPrice().toPlainString(),
                                "0",
                                row.unitPrice().toPlainString()
                            );
                        } catch (IOException exception) {
                            throw new CsvWriteException(exception);
                        }
                        outputLines[0]++;
                    }
                });
            } catch (CsvWriteException exception) {
                throw exception.ioException();
            }

            writeCatalog(catalogTemporary, products);
            writeRejections(rejectionsTemporary, source.rejectedRows());
            writeReport(
                reportTemporary,
                inputZip,
                csvEntry,
                source,
                receiptLimit,
                selectedReceipts.size(),
                outputLines[0],
                products,
                cciLines[0],
                cciReceipts.size()
            );

            replace(transactionsTemporary, transactionsTarget);
            replace(catalogTemporary, catalogTarget);
            replace(rejectionsTemporary, rejectionsTarget);
            replace(reportTemporary, reportTarget);
        } finally {
            Files.deleteIfExists(transactionsTemporary);
            Files.deleteIfExists(catalogTemporary);
            Files.deleteIfExists(rejectionsTemporary);
            Files.deleteIfExists(reportTemporary);
        }

        return new PreparationResult(
            source.totalRows(),
            source.receipts().size(),
            selectedReceipts.size(),
            outputLines[0],
            source.rejectedRows().size(),
            source.receipts().values().stream().filter(receipt -> receipt.invalid).count(),
            source.quarantinedRows(),
            products.size(),
            products.values().stream().filter(ProductState::cci).count(),
            cciReceipts.size(),
            transactionsTarget,
            catalogTarget,
            rejectionsTarget,
            reportTarget
        );
    }

    private void writeCatalog(Path path, Map<String, ProductState> products) throws IOException {
        try (
            BufferedWriter writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8);
            CSVPrinter printer = CSVFormat.RFC4180.builder().setHeader(CATALOG_HEADERS).get().print(writer)
        ) {
            for (ProductState product : products.values().stream()
                .sorted(Comparator.comparing(ProductState::selectedSourceName))
                .toList()) {
                String sourceName = product.selectedSourceName();
                printer.printRecord(
                    sourceName,
                    sourceName,
                    "",
                    product.selectedBrand(),
                    "",
                    product.selectedCategory(),
                    "",
                    "",
                    "",
                    product.cci()
                );
            }
        }
    }

    private void writeRejections(Path path, List<RejectedRow> rejectedRows) throws IOException {
        try (
            BufferedWriter writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8);
            CSVPrinter printer = CSVFormat.RFC4180.builder().setHeader(REJECTION_HEADERS).get().print(writer)
        ) {
            for (RejectedRow rejected : rejectedRows) {
                printer.printRecord(
                    rejected.sourceRowNumber(),
                    rejected.storeId(),
                    rejected.receiptId(),
                    rejected.reason()
                );
            }
        }
    }

    private void writeReport(
        Path path,
        Path inputZip,
        ZipEntry csvEntry,
        SourceProfile source,
        int receiptLimit,
        int selectedReceipts,
        long outputLines,
        Map<String, ProductState> products,
        long cciLines,
        int cciReceipts
    ) throws IOException {
        long quarantinedReceipts = source.receipts().values().stream().filter(receipt -> receipt.invalid).count();
        long eligibleReceipts = source.receipts().size() - quarantinedReceipts;

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("sourceDataset", "Kaggle supermarket dataset 2019");
        report.put("sourceUrl", "https://www.kaggle.com/datasets/mexwell/supermarket-dataset");
        report.put("license", "CC BY 4.0");
        report.put("sourceZip", inputZip.toAbsolutePath().toString());
        report.put("sourceZipSha256", sha256(inputZip));
        report.put("sourceEntry", csvEntry.getName());
        report.put("retailerCode", "KAGGLE");
        report.put("profileCode", "KAGGLE_2019");
        report.put("currency", "AZN");
        report.put("zoneId", "Asia/Baku");
        report.put("samplingMethod", "lowest SHA-256 hashes of store ID + receipt ID");
        report.put("requestedReceiptLimit", receiptLimit);
        report.put("inputRows", source.totalRows());
        report.put("inputReceipts", source.receipts().size());
        report.put("inputStores", source.stores().size());
        report.put("malformedRows", source.rejectedRows().size());
        report.put("quarantinedReceipts", quarantinedReceipts);
        report.put("quarantinedReceiptRows", source.quarantinedRows());
        report.put("eligibleReceipts", eligibleReceipts);
        report.put("selectedReceipts", selectedReceipts);
        report.put("outputTransactionLines", outputLines);
        report.put("catalogProducts", products.size());
        report.put("cciCatalogProducts", products.values().stream().filter(ProductState::cci).count());
        report.put("cciTransactionLines", cciLines);
        report.put("cciReceipts", cciReceipts);
        report.put("sourceProductCodes", source.sourceProductCodes());
        report.put("ambiguousSourceProductCodes", source.ambiguousSourceProductCodes());
        report.put("sourceProductCodePolicy", "omitted because source codes map to unrelated product names");
        report.put("quantityPolicy", "one source row equals quantity 1");
        report.put("discountPolicy", "discount_amount is 0; campaign labels are not monetary discounts");
        report.put("lineTotalPolicy", "line_total equals unit_price");
        report.put("promotionRows", source.promotionRows());
        report.put("approvedCciBrands", CCI_BRAND_RULES.stream().map(BrandRule::brand).toList());

        objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), report);
    }

    private SourceRow parseSourceRow(CSVRecord record) {
        List<String> errors = new ArrayList<>();
        String storeId = required(record, "magaza_ad", errors);
        String receiptId = required(record, "satish_kodu", errors);
        String sourceProductCode = required(record, "mehsul_kodu", errors);
        String productName = required(record, "mehsul_ad", errors);
        String category = required(record, "mehsul_kateqoriya", errors);
        String timestampText = required(record, "satish_tarixi", errors);
        String priceText = required(record, "mehsul_qiymet", errors);
        String promotionLabel = value(record, "endirim_kompaniya");

        LocalDateTime timestamp = null;
        if (timestampText != null) {
            try {
                timestamp = LocalDateTime.parse(timestampText, SOURCE_TIMESTAMP);
            } catch (DateTimeParseException exception) {
                errors.add("satish_tarixi is not dd/MM/yyyy HH:mm");
            }
        }

        BigDecimal unitPrice = null;
        if (priceText != null) {
            try {
                unitPrice = new BigDecimal(priceText);
                if (unitPrice.signum() <= 0) {
                    errors.add("mehsul_qiymet must be greater than zero");
                }
            } catch (NumberFormatException exception) {
                errors.add("mehsul_qiymet is not a plain decimal");
            }
        }

        return new SourceRow(
            storeId,
            receiptId,
            sourceProductCode,
            productName,
            category,
            timestamp,
            unitPrice,
            promotionLabel.isBlank() ? "<NONE>" : promotionLabel,
            errors
        );
    }

    private String required(CSVRecord record, String column, List<String> errors) {
        String value = value(record, column);
        if (value.isBlank()) {
            errors.add(column + " is required");
            return null;
        }
        return value;
    }

    private String value(CSVRecord record, String column) {
        return record.isMapped(column) ? record.get(column).trim() : "";
    }

    private void validateHeaders(CSVParser parser) {
        List<String> missing = REQUIRED_HEADERS.stream()
            .filter(header -> !parser.getHeaderNames().contains(header))
            .toList();
        if (!missing.isEmpty()) {
            throw new IllegalArgumentException("Missing required source columns: " + String.join(", ", missing));
        }
    }

    private void readSource(ZipFile archive, ZipEntry csvEntry, Consumer<CSVParser> consumer) throws IOException {
        CSVFormat format = CSVFormat.RFC4180.builder()
            .setHeader()
            .setSkipHeaderRecord(true)
            .setIgnoreEmptyLines(true)
            .setAllowMissingColumnNames(true)
            .setTrim(true)
            .get();
        try (
            InputStream input = archive.getInputStream(csvEntry);
            Reader reader = new InputStreamReader(input, StandardCharsets.UTF_8);
            CSVParser parser = format.parse(reader)
        ) {
            consumer.accept(parser);
        }
    }

    private BrandMatch brandMatch(String productName) {
        for (BrandRule rule : CCI_BRAND_RULES) {
            if (rule.pattern().matcher(productName).find()) {
                return new BrandMatch(rule.brand(), true);
            }
        }
        return new BrandMatch("", false);
    }

    private String nameProductKey(String productName) {
        return "NAME:" + productName.trim().toUpperCase(Locale.ROOT);
    }

    private String sampleHash(ReceiptKey key) {
        return sha256(key.stableValue().getBytes(StandardCharsets.UTF_8));
    }

    private String sha256(Path path) throws IOException {
        try (InputStream input = Files.newInputStream(path)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private Path temporarySibling(Path target) throws IOException {
        return Files.createTempFile(target.getParent(), target.getFileName().toString(), ".tmp");
    }

    private void replace(Path source, Path target) throws IOException {
        try {
            Files.move(
                source,
                target,
                StandardCopyOption.REPLACE_EXISTING,
                StandardCopyOption.ATOMIC_MOVE
            );
        } catch (java.nio.file.AtomicMoveNotSupportedException exception) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    public record PreparationResult(
        long inputRows,
        long inputReceipts,
        int selectedReceipts,
        long outputLines,
        int malformedRows,
        long quarantinedReceipts,
        long quarantinedRows,
        int catalogProducts,
        long cciCatalogProducts,
        int cciReceipts,
        Path transactionsFile,
        Path catalogFile,
        Path rejectionsFile,
        Path reportFile
    ) {
    }

    private record ReceiptKey(String storeId, String receiptId) {
        String stableValue() {
            return storeId + "\u0000" + receiptId;
        }
    }

    private static final class ReceiptState {
        private long totalRows;
        private LocalDateTime timestamp;
        private boolean invalid;
    }

    private record SourceProfile(
        long totalRows,
        Map<ReceiptKey, ReceiptState> receipts,
        Set<String> stores,
        int sourceProductCodes,
        long ambiguousSourceProductCodes,
        Map<String, Long> promotionRows,
        List<RejectedRow> rejectedRows,
        long quarantinedRows
    ) {
    }

    private record SourceRow(
        String storeId,
        String receiptId,
        String sourceProductCode,
        String productName,
        String category,
        LocalDateTime timestamp,
        BigDecimal unitPrice,
        String promotionLabel,
        List<String> errors
    ) {
        ReceiptKey receiptKey() {
            return storeId == null || receiptId == null ? null : new ReceiptKey(storeId, receiptId);
        }
    }

    private record RejectedRow(long sourceRowNumber, String storeId, String receiptId, String reason) {
    }

    private record BrandRule(String brand, Pattern pattern) {
    }

    private record BrandMatch(String brand, boolean cci) {
    }

    private static final class ProductState {
        private final Map<String, Long> sourceNameCounts = new HashMap<>();
        private final Map<String, Long> categoryCounts = new HashMap<>();
        private final Map<String, Long> cciBrandCounts = new HashMap<>();

        private void add(String sourceName, String category, BrandMatch brand) {
            sourceNameCounts.merge(sourceName, 1L, Long::sum);
            categoryCounts.merge(category, 1L, Long::sum);
            if (brand.cci()) {
                cciBrandCounts.merge(brand.brand(), 1L, Long::sum);
            }
        }

        private String selectedSourceName() {
            return mostFrequent(sourceNameCounts);
        }

        private String selectedCategory() {
            return mostFrequent(categoryCounts);
        }

        private String selectedBrand() {
            return cciBrandCounts.isEmpty() ? "" : mostFrequent(cciBrandCounts);
        }

        private boolean cci() {
            return !cciBrandCounts.isEmpty();
        }

        private String mostFrequent(Map<String, Long> values) {
            return values.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed()
                    .thenComparing(Map.Entry.comparingByKey()))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElse("");
        }
    }

    private static final class CsvWriteException extends RuntimeException {
        private final IOException ioException;

        private CsvWriteException(IOException ioException) {
            super(ioException);
            this.ioException = ioException;
        }

        private IOException ioException() {
            return ioException;
        }
    }
}
