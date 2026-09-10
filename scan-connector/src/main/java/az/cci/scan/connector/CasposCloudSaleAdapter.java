package az.cci.scan.connector;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.CellValue;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;

import java.io.BufferedWriter;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Provisional adapter for the observed CloudSale-shaped sample workbook.
 *
 * <p>This is deliberately opt-in. CASPOS has not confirmed that these headers or values are a
 * stable vendor contract. The adapter fails closed on unsupported receipt states and receipt-level
 * discounts, and removes cashier/payment/category/tax fields before upload.</p>
 */
final class CasposCloudSaleAdapter implements SourceFileAdapter {

    static {
        if (System.getProperty("log4j2.loggerContextFactory") == null) {
            System.setProperty(
                "log4j2.loggerContextFactory",
                "org.apache.logging.log4j.simple.SimpleLoggerContextFactory"
            );
        }
    }

    private static final String TRANSACTION_SHEET = "Satış çekləri";
    private static final String COMPLETED_STATUS = "Tamamlanıb";
    private static final ZoneId PILOT_ZONE = ZoneId.of("Asia/Baku");
    private static final long MAX_FILE_BYTES = 25L * 1024 * 1024;
    private static final List<String> REQUIRED_HEADERS = List.of(
        "Obyekt_kodu",
        "Kassa_kodu",
        "Çek_nömrəsi",
        "Çek_tarixi",
        "Sətir_nömrəsi",
        "Məhsul_adı",
        "Miqdar",
        "Vahid_qiyməti_AZN",
        "Sətir_endirimi_AZN",
        "Sətir_məbləği_AZN",
        "Çek_endirimi_AZN",
        "Çek_statusu"
    );
    private static final List<String> CANONICAL_HEADERS = List.of(
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
    );

    private final Path workDirectory;

    CasposCloudSaleAdapter(Path workDirectory) {
        this.workDirectory = workDirectory;
    }

    @Override
    public PreparedUpload prepare(Path source) throws IOException, SourceFileValidationException {
        requireExcel(source);
        Path temporaryDirectory = Files.createTempDirectory(workDirectory, ".scan-caspos-");
        Path upload = temporaryDirectory.resolve(sanitizedFilename(source));
        try {
            ConversionSummary summary;
            try (BufferedWriter writer = Files.newBufferedWriter(upload, StandardCharsets.UTF_8)) {
                summary = convert(source, writer);
            }
            if (Files.size(upload) > MAX_FILE_BYTES) {
                throw new SourceFileValidationException(
                    "Converted upload exceeds SCAN's 25 MB pilot limit"
                );
            }
            return new PreparedUpload(upload, temporaryDirectory, summary.message());
        } catch (IOException | SourceFileValidationException | RuntimeException exception) {
            Files.deleteIfExists(upload);
            Files.deleteIfExists(temporaryDirectory);
            throw exception;
        }
    }

    ConversionSummary validate(Path source) throws IOException, SourceFileValidationException {
        requireExcel(source);
        return convert(source, null);
    }

    private ConversionSummary convert(Path source, BufferedWriter writer)
        throws IOException, SourceFileValidationException {
        try (Workbook workbook = WorkbookFactory.create(source.toFile(), null, true)) {
            Sheet sheet = workbook.getSheet(TRANSACTION_SHEET);
            if (sheet == null) {
                throw new SourceFileValidationException(
                    "Expected worksheet '" + TRANSACTION_SHEET + "' was not found"
                );
            }
            Row headerRow = sheet.getRow(sheet.getFirstRowNum());
            if (headerRow == null) {
                throw new SourceFileValidationException("The transaction worksheet has no header row");
            }

            FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();
            DataFormatter formatter = new DataFormatter(Locale.ROOT);
            Map<String, Integer> columns = columns(headerRow, formatter, evaluator);
            List<String> missing = REQUIRED_HEADERS.stream()
                .filter(header -> !columns.containsKey(header))
                .toList();
            if (!missing.isEmpty()) {
                throw new SourceFileValidationException("Missing required columns: " + String.join(", ", missing));
            }

            List<CanonicalLine> lines = new ArrayList<>();
            List<String> errors = new ArrayList<>();
            Map<ReceiptIdentity, Set<Integer>> receiptLineNumbers = new HashMap<>();
            Map<ReceiptIdentity, String> receiptTimestamps = new HashMap<>();
            for (int rowIndex = headerRow.getRowNum() + 1; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                Row row = sheet.getRow(rowIndex);
                if (row == null || isEmpty(row, formatter, evaluator)) {
                    continue;
                }
                try {
                    CanonicalLine line = parseLine(row, columns, formatter, evaluator);
                    ReceiptIdentity receipt = new ReceiptIdentity(
                        line.storeId(), line.registerId(), line.sourceReceiptId()
                    );
                    String previousTimestamp = receiptTimestamps.putIfAbsent(receipt, line.timestamp());
                    if (previousTimestamp != null && !previousTimestamp.equals(line.timestamp())) {
                        throw new IllegalArgumentException(
                            "receipt " + line.sourceReceiptId() + " has inconsistent Çek_tarixi values"
                        );
                    }
                    Set<Integer> numbers = receiptLineNumbers.computeIfAbsent(receipt, ignored -> new HashSet<>());
                    if (!numbers.add(line.lineNumber())) {
                        throw new IllegalArgumentException(
                            "duplicate Sətir_nömrəsi " + line.lineNumber() + " in receipt " + line.sourceReceiptId()
                        );
                    }
                    lines.add(line);
                } catch (IllegalArgumentException exception) {
                    errors.add("row " + (rowIndex + 1) + ": " + exception.getMessage());
                }
            }
            receiptLineNumbers.forEach((receipt, numbers) -> {
                int maximum = numbers.stream().mapToInt(Integer::intValue).max().orElse(0);
                if (!numbers.contains(1) || maximum != numbers.size()) {
                    errors.add(
                        "receipt " + receipt.receiptId() + ": Sətir_nömrəsi must be contiguous from 1"
                    );
                }
            });
            if (lines.isEmpty() && errors.isEmpty()) {
                errors.add("the transaction worksheet contains no data rows");
            }
            if (!errors.isEmpty()) {
                String details = String.join("; ", errors.stream().limit(20).toList());
                if (errors.size() > 20) {
                    details += "; and " + (errors.size() - 20) + " more error(s)";
                }
                throw new SourceFileValidationException(details);
            }

            if (writer != null) {
                writeCanonicalCsv(writer, lines);
            }
            int receiptCount = receiptLineNumbers.size();
            BigDecimal total = lines.stream()
                .map(CanonicalLine::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            return new ConversionSummary(receiptCount, lines.size(), total);
        } catch (SourceFileValidationException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new SourceFileValidationException(
                "Unable to read the provisional CloudSale workbook safely: " + safeMessage(exception),
                exception
            );
        }
    }

    private CanonicalLine parseLine(
        Row row,
        Map<String, Integer> columns,
        DataFormatter formatter,
        FormulaEvaluator evaluator
    ) {
        String storeId = bounded(
            requiredText(row, columns, "Obyekt_kodu", formatter, evaluator), 128, "Obyekt_kodu"
        );
        String registerId = bounded(
            requiredText(row, columns, "Kassa_kodu", formatter, evaluator), 128, "Kassa_kodu"
        );
        String sourceReceiptId = requiredText(row, columns, "Çek_nömrəsi", formatter, evaluator);
        String timestamp = timestamp(row, columns.get("Çek_tarixi"), formatter, evaluator);
        int lineNumber = positiveInteger(row, columns, "Sətir_nömrəsi", formatter, evaluator);
        String productCode = bounded(
            optionalText(row, columns, "Məhsul_kodu", formatter, evaluator), 128, "Məhsul_kodu"
        );
        String barcode = bounded(optionalText(row, columns, "Barkod", formatter, evaluator), 64, "Barkod");
        String productName = bounded(
            requiredText(row, columns, "Məhsul_adı", formatter, evaluator), 512, "Məhsul_adı"
        );
        BigDecimal quantity = decimal(row, columns, "Miqdar", evaluator);
        BigDecimal unitPrice = decimal(row, columns, "Vahid_qiyməti_AZN", evaluator);
        BigDecimal lineDiscount = decimal(row, columns, "Sətir_endirimi_AZN", evaluator);
        BigDecimal sourceLineTotal = decimal(row, columns, "Sətir_məbləği_AZN", evaluator);
        BigDecimal receiptDiscount = decimal(row, columns, "Çek_endirimi_AZN", evaluator);
        String status = requiredText(row, columns, "Çek_statusu", formatter, evaluator);

        if (!COMPLETED_STATUS.equalsIgnoreCase(status)) {
            throw new IllegalArgumentException(
                "unsupported Çek_statusu '" + status + "'; only '" + COMPLETED_STATUS + "' is safe for this pilot"
            );
        }
        if (receiptDiscount.signum() != 0) {
            throw new IllegalArgumentException(
                "Çek_endirimi_AZN is non-zero; receipt-level discount allocation is not defined"
            );
        }
        if (quantity.signum() <= 0) {
            throw new IllegalArgumentException("Miqdar must be greater than zero");
        }
        if (unitPrice.signum() < 0 || lineDiscount.signum() < 0 || sourceLineTotal.signum() < 0) {
            throw new IllegalArgumentException("price, discount, and line amount must not be negative");
        }
        BigDecimal calculated = quantity.multiply(unitPrice)
            .subtract(lineDiscount)
            .setScale(2, RoundingMode.HALF_UP);
        if (calculated.compareTo(sourceLineTotal.setScale(2, RoundingMode.HALF_UP)) != 0) {
            throw new IllegalArgumentException(
                "Sətir_məbləği_AZN " + sourceLineTotal.toPlainString()
                    + " does not equal ROUND(Miqdar × Vahid_qiyməti_AZN − Sətir_endirimi_AZN, 2) "
                    + calculated.toPlainString()
            );
        }

        String receiptId = bounded(
            registerId + ":" + sourceReceiptId, 256, "combined Kassa_kodu:Çek_nömrəsi"
        );
        return new CanonicalLine(
            storeId,
            registerId,
            sourceReceiptId,
            receiptId,
            timestamp,
            lineNumber,
            productCode,
            barcode,
            productName,
            quantity,
            unitPrice,
            lineDiscount,
            sourceLineTotal
        );
    }

    private Map<String, Integer> columns(Row header, DataFormatter formatter, FormulaEvaluator evaluator)
        throws SourceFileValidationException {
        Map<String, Integer> columns = new LinkedHashMap<>();
        for (int index = 0; index < header.getLastCellNum(); index++) {
            String name = cellText(header.getCell(index), formatter, evaluator);
            if (name.isBlank()) {
                continue;
            }
            if (columns.putIfAbsent(name, index) != null) {
                throw new SourceFileValidationException("Duplicate column header: " + name);
            }
        }
        return columns;
    }

    private boolean isEmpty(Row row, DataFormatter formatter, FormulaEvaluator evaluator) {
        for (Cell cell : row) {
            if (!cellText(cell, formatter, evaluator).isBlank()) {
                return false;
            }
        }
        return true;
    }

    private String requiredText(
        Row row,
        Map<String, Integer> columns,
        String header,
        DataFormatter formatter,
        FormulaEvaluator evaluator
    ) {
        String value = optionalText(row, columns, header, formatter, evaluator);
        if (value.isBlank()) {
            throw new IllegalArgumentException(header + " is required");
        }
        return value;
    }

    private String optionalText(
        Row row,
        Map<String, Integer> columns,
        String header,
        DataFormatter formatter,
        FormulaEvaluator evaluator
    ) {
        Integer index = columns.get(header);
        return index == null ? "" : cellText(row.getCell(index), formatter, evaluator);
    }

    private String cellText(Cell cell, DataFormatter formatter, FormulaEvaluator evaluator) {
        if (cell == null) {
            return "";
        }
        return formatter.formatCellValue(cell, evaluator).trim();
    }

    private int positiveInteger(
        Row row,
        Map<String, Integer> columns,
        String header,
        DataFormatter formatter,
        FormulaEvaluator evaluator
    ) {
        String value = requiredText(row, columns, header, formatter, evaluator);
        try {
            int number = new BigDecimal(value).intValueExact();
            if (number <= 0) {
                throw new ArithmeticException();
            }
            return number;
        } catch (NumberFormatException | ArithmeticException exception) {
            throw new IllegalArgumentException(header + " must be a positive whole number");
        }
    }

    private BigDecimal decimal(
        Row row,
        Map<String, Integer> columns,
        String header,
        FormulaEvaluator evaluator
    ) {
        Cell cell = row.getCell(columns.get(header));
        if (cell == null || cell.getCellType() == CellType.BLANK) {
            throw new IllegalArgumentException(header + " is required");
        }
        try {
            BigDecimal value = switch (cell.getCellType()) {
                case NUMERIC -> BigDecimal.valueOf(cell.getNumericCellValue());
                case STRING -> new BigDecimal(cell.getStringCellValue().trim());
                case FORMULA -> decimal(evaluator.evaluate(cell), header);
                default -> throw new NumberFormatException();
            };
            BigDecimal significant = value.stripTrailingZeros();
            if (Math.max(significant.scale(), 0) > 4 || significant.precision() > 19) {
                throw new IllegalArgumentException(
                    header + " must fit numeric(19,4) and have at most four decimal places"
                );
            }
            return value;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(header + " must be a plain decimal number");
        }
    }

    private String bounded(String value, int maximumLength, String header) {
        if (value.length() > maximumLength) {
            throw new IllegalArgumentException(header + " exceeds " + maximumLength + " characters");
        }
        return value;
    }

    private BigDecimal decimal(CellValue value, String header) {
        if (value == null) {
            throw new IllegalArgumentException(header + " formula has no calculated value");
        }
        return switch (value.getCellType()) {
            case NUMERIC -> BigDecimal.valueOf(value.getNumberValue());
            case STRING -> {
                try {
                    yield new BigDecimal(value.getStringValue().trim());
                } catch (NumberFormatException exception) {
                    throw new IllegalArgumentException(header + " formula must calculate a decimal number");
                }
            }
            default -> throw new IllegalArgumentException(header + " formula must calculate a decimal number");
        };
    }

    private String timestamp(
        Row row,
        int column,
        DataFormatter formatter,
        FormulaEvaluator evaluator
    ) {
        Cell cell = row.getCell(column);
        if (cell == null || cell.getCellType() == CellType.BLANK) {
            throw new IllegalArgumentException("Çek_tarixi is required");
        }
        if (cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
            return cell.getLocalDateTimeCellValue().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        }
        String value = cellText(cell, formatter, evaluator);
        try {
            return LocalDateTime.ofInstant(Instant.parse(value), PILOT_ZONE)
                .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (DateTimeParseException ignored) {
            // Try an explicit offset or the provisional local timestamp next.
        }
        try {
            return OffsetDateTime.parse(value)
                .atZoneSameInstant(PILOT_ZONE)
                .toLocalDateTime()
                .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (DateTimeParseException ignored) {
            // Try the provisional local timestamp next.
        }
        try {
            return LocalDateTime.parse(value).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (DateTimeParseException exception) {
            throw new IllegalArgumentException(
                "Çek_tarixi must be an Excel date or ISO-8601 timestamp, but was '" + value + "'"
            );
        }
    }

    private void writeCanonicalCsv(BufferedWriter writer, List<CanonicalLine> lines) throws IOException {
        writer.write(String.join(",", CANONICAL_HEADERS));
        writer.newLine();
        for (CanonicalLine line : lines) {
            List<String> fields = List.of(
                line.storeId(),
                line.receiptId(),
                line.timestamp(),
                line.productCode(),
                line.barcode(),
                line.productName(),
                line.quantity().toPlainString(),
                line.unitPrice().toPlainString(),
                line.lineDiscount().toPlainString(),
                line.lineTotal().toPlainString()
            );
            writer.write(String.join(",", fields.stream().map(this::csv).toList()));
            writer.newLine();
        }
    }

    private String csv(String value) {
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private void requireExcel(Path source) throws SourceFileValidationException {
        String filename = source.getFileName().toString().toLowerCase(Locale.ROOT);
        if (!filename.endsWith(".xlsx") && !filename.endsWith(".xls")) {
            throw new SourceFileValidationException(
                "CASPOS_CLOUDSALE_PROVISIONAL accepts only .xls or .xlsx workbooks"
            );
        }
        try {
            if (Files.size(source) > MAX_FILE_BYTES) {
                throw new SourceFileValidationException(
                    "Workbook exceeds the provisional 25 MB safety limit"
                );
            }
        } catch (IOException exception) {
            throw new SourceFileValidationException("Unable to read workbook size", exception);
        }
    }

    private String sanitizedFilename(Path source) {
        String filename = source.getFileName().toString().replaceAll("[^A-Za-z0-9._-]", "_");
        return filename + ".scan.csv";
    }

    private String safeMessage(RuntimeException exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? exception.getClass().getSimpleName() : message;
    }

    record ConversionSummary(int receipts, int lines, BigDecimal salesTotal) {
        String message() {
            return receipts + " receipt(s), " + lines + " line(s), "
                + salesTotal.setScale(2, RoundingMode.HALF_UP).toPlainString() + " AZN";
        }
    }

    private record ReceiptIdentity(String storeId, String registerId, String receiptId) {
    }

    private record CanonicalLine(
        String storeId,
        String registerId,
        String sourceReceiptId,
        String receiptId,
        String timestamp,
        int lineNumber,
        String productCode,
        String barcode,
        String productName,
        BigDecimal quantity,
        BigDecimal unitPrice,
        BigDecimal lineDiscount,
        BigDecimal lineTotal
    ) {
    }
}
