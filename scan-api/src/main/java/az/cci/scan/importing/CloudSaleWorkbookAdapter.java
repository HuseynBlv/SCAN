package az.cci.scan.importing;

import az.cci.scan.domain.ImportProfile;
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
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Component
public class CloudSaleWorkbookAdapter {

    private static final String TRANSACTION_SHEET = "Satış çekləri";
    private static final String COMPLETED_STATUS = "Tamamlanıb";
    private static final List<String> REQUIRED_HEADERS = List.of(
        "Obyekt_kodu", "Kassa_kodu", "Çek_nömrəsi", "Çek_tarixi", "Sətir_nömrəsi",
        "Məhsul_adı", "Miqdar", "Vahid_qiyməti_AZN", "Sətir_endirimi_AZN",
        "Sətir_məbləği_AZN", "Çek_endirimi_AZN", "Çek_statusu"
    );
    private static final Map<String, String> FIELD_MAP = Map.ofEntries(
        Map.entry("storeId", "Obyekt_kodu"),
        Map.entry("receiptId", "Kassa_kodu + Çek_nömrəsi"),
        Map.entry("timestamp", "Çek_tarixi"),
        Map.entry("productCode", "Məhsul_kodu"),
        Map.entry("barcode", "Barkod"),
        Map.entry("productName", "Məhsul_adı"),
        Map.entry("category", "Kateqoriya"),
        Map.entry("quantity", "Miqdar"),
        Map.entry("unitPrice", "Vahid_qiyməti_AZN"),
        Map.entry("discountAmount", "Sətir_endirimi_AZN"),
        Map.entry("lineTotal", "Sətir_məbləği_AZN")
    );

    public Optional<IngestionAnalysis> analyze(String filename, byte[] bytes, ImportProfile profile) {
        String normalized = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (!normalized.endsWith(".xlsx") && !normalized.endsWith(".xls")) {
            return Optional.empty();
        }
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            Sheet sheet = workbook.getSheet(TRANSACTION_SHEET);
            if (sheet == null) {
                return Optional.empty();
            }
            return Optional.of(analyzeSheet(workbook, sheet, profile));
        } catch (IOException | RuntimeException exception) {
            return Optional.of(new IngestionAnalysis(
                "CLOUDSALE_OBSERVED",
                "CloudSale workbook adapter",
                0,
                Set.of(),
                FIELD_MAP,
                List.of(),
                List.of("file: unable to read the CloudSale workbook safely")
            ));
        }
    }

    private IngestionAnalysis analyzeSheet(Workbook workbook, Sheet sheet, ImportProfile profile) {
        Row headerRow = sheet.getRow(sheet.getFirstRowNum());
        if (headerRow == null) {
            return failure(0, Set.of(), "file: the transaction worksheet has no header row");
        }
        FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();
        DataFormatter formatter = new DataFormatter(Locale.ROOT);
        Map<String, Integer> columns;
        try {
            columns = columns(headerRow, formatter, evaluator);
        } catch (IllegalArgumentException exception) {
            return failure(0, Set.of(), "file: " + exception.getMessage());
        }
        List<String> missing = REQUIRED_HEADERS.stream().filter(header -> !columns.containsKey(header)).toList();
        if (!missing.isEmpty()) {
            return failure(0, columns.keySet(), "file: missing CloudSale columns: " + String.join(", ", missing));
        }

        List<ParsedTransactionLine> lines = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        Map<ReceiptIdentity, Set<Integer>> lineNumbers = new HashMap<>();
        Map<ReceiptIdentity, Instant> timestamps = new HashMap<>();
        int sourceRows = 0;
        for (int rowIndex = headerRow.getRowNum() + 1; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
            Row row = sheet.getRow(rowIndex);
            if (row == null || empty(row, formatter, evaluator)) {
                continue;
            }
            sourceRows++;
            try {
                AdaptedLine adapted = parseLine(row, columns, formatter, evaluator, profile);
                ReceiptIdentity identity = new ReceiptIdentity(
                    adapted.line().storeId(), adapted.registerId(), adapted.sourceReceiptId()
                );
                Instant priorTimestamp = timestamps.putIfAbsent(identity, adapted.line().transactionTimestamp());
                if (priorTimestamp != null && !priorTimestamp.equals(adapted.line().transactionTimestamp())) {
                    throw new IllegalArgumentException("receipt has inconsistent Çek_tarixi values");
                }
                Set<Integer> receiptLines = lineNumbers.computeIfAbsent(identity, ignored -> new HashSet<>());
                if (!receiptLines.add(adapted.lineNumber())) {
                    throw new IllegalArgumentException("duplicate Sətir_nömrəsi " + adapted.lineNumber());
                }
                lines.add(adapted.line());
            } catch (IllegalArgumentException exception) {
                errors.add("row " + (rowIndex + 1) + ": " + exception.getMessage());
            }
        }
        lineNumbers.forEach((receipt, numbers) -> {
            int maximum = numbers.stream().mapToInt(Integer::intValue).max().orElse(0);
            if (!numbers.contains(1) || maximum != numbers.size()) {
                errors.add("receipt " + receipt.receiptId() + ": Sətir_nömrəsi must be contiguous from 1");
            }
        });
        if (sourceRows == 0) {
            errors.add("file: the transaction worksheet contains no data rows");
        }
        return new IngestionAnalysis(
            "CLOUDSALE_OBSERVED",
            "CloudSale workbook adapter",
            sourceRows,
            columns.keySet(),
            FIELD_MAP,
            errors.isEmpty() ? lines : List.of(),
            errors.stream().limit(100).toList()
        );
    }

    private AdaptedLine parseLine(
        Row row,
        Map<String, Integer> columns,
        DataFormatter formatter,
        FormulaEvaluator evaluator,
        ImportProfile profile
    ) {
        String storeId = bounded(text(row, columns, "Obyekt_kodu", formatter, evaluator), 128, "Obyekt_kodu");
        String registerId = bounded(text(row, columns, "Kassa_kodu", formatter, evaluator), 128, "Kassa_kodu");
        String sourceReceiptId = text(row, columns, "Çek_nömrəsi", formatter, evaluator);
        Instant timestamp = timestamp(row.getCell(columns.get("Çek_tarixi")), formatter, evaluator, profile);
        int lineNumber = positiveInteger(text(row, columns, "Sətir_nömrəsi", formatter, evaluator), "Sətir_nömrəsi");
        String productCode = bounded(optionalText(row, columns, "Məhsul_kodu", formatter, evaluator), 128, "Məhsul_kodu");
        String barcode = bounded(optionalText(row, columns, "Barkod", formatter, evaluator), 64, "Barkod");
        String productName = bounded(text(row, columns, "Məhsul_adı", formatter, evaluator), 512, "Məhsul_adı");
        String category = bounded(optionalText(row, columns, "Kateqoriya", formatter, evaluator), 128, "Kateqoriya");
        BigDecimal quantity = decimal(row, columns, "Miqdar", evaluator);
        BigDecimal unitPrice = decimal(row, columns, "Vahid_qiyməti_AZN", evaluator);
        BigDecimal discount = decimal(row, columns, "Sətir_endirimi_AZN", evaluator);
        BigDecimal lineTotal = decimal(row, columns, "Sətir_məbləği_AZN", evaluator);
        BigDecimal receiptDiscount = decimal(row, columns, "Çek_endirimi_AZN", evaluator);
        String status = text(row, columns, "Çek_statusu", formatter, evaluator);

        if (!COMPLETED_STATUS.equalsIgnoreCase(status)) {
            throw new IllegalArgumentException("unsupported Çek_statusu '" + status + "'");
        }
        if (receiptDiscount.signum() != 0) {
            throw new IllegalArgumentException("Çek_endirimi_AZN is non-zero; allocation is not defined");
        }
        if (quantity.signum() <= 0) {
            throw new IllegalArgumentException("Miqdar must be greater than zero");
        }
        if (unitPrice.signum() < 0 || discount.signum() < 0 || lineTotal.signum() < 0) {
            throw new IllegalArgumentException("price, discount, and line amount must not be negative");
        }
        BigDecimal calculated = quantity.multiply(unitPrice).subtract(discount).setScale(2, RoundingMode.HALF_UP);
        if (calculated.compareTo(lineTotal.setScale(2, RoundingMode.HALF_UP)) != 0) {
            throw new IllegalArgumentException(
                "Sətir_məbləği_AZN does not equal quantity × unit price − line discount"
            );
        }
        String receiptId = bounded(registerId + ":" + sourceReceiptId, 256, "receipt identity");
        ParsedTransactionLine line = new ParsedTransactionLine(
            row.getRowNum() + 1,
            storeId,
            receiptId,
            timestamp,
            blankToNull(productCode),
            blankToNull(barcode),
            productName,
            blankToNull(category),
            quantity,
            unitPrice,
            discount,
            lineTotal
        );
        return new AdaptedLine(registerId, sourceReceiptId, lineNumber, line);
    }

    private Map<String, Integer> columns(Row header, DataFormatter formatter, FormulaEvaluator evaluator) {
        Map<String, Integer> columns = new LinkedHashMap<>();
        for (int index = 0; index < header.getLastCellNum(); index++) {
            String value = cellText(header.getCell(index), formatter, evaluator);
            if (!value.isBlank() && columns.putIfAbsent(value, index) != null) {
                throw new IllegalArgumentException("duplicate column header: " + value);
            }
        }
        return columns;
    }

    private boolean empty(Row row, DataFormatter formatter, FormulaEvaluator evaluator) {
        for (Cell cell : row) {
            if (!cellText(cell, formatter, evaluator).isBlank()) {
                return false;
            }
        }
        return true;
    }

    private String text(Row row, Map<String, Integer> columns, String header, DataFormatter formatter, FormulaEvaluator evaluator) {
        String value = optionalText(row, columns, header, formatter, evaluator);
        if (value.isBlank()) {
            throw new IllegalArgumentException(header + " is required");
        }
        return value;
    }

    private String optionalText(Row row, Map<String, Integer> columns, String header, DataFormatter formatter, FormulaEvaluator evaluator) {
        Integer index = columns.get(header);
        return index == null ? "" : cellText(row.getCell(index), formatter, evaluator);
    }

    private String cellText(Cell cell, DataFormatter formatter, FormulaEvaluator evaluator) {
        return cell == null ? "" : formatter.formatCellValue(cell, evaluator).trim();
    }

    private BigDecimal decimal(Row row, Map<String, Integer> columns, String header, FormulaEvaluator evaluator) {
        Cell cell = row.getCell(columns.get(header));
        if (cell == null || cell.getCellType() == CellType.BLANK) {
            throw new IllegalArgumentException(header + " is required");
        }
        try {
            BigDecimal value = switch (cell.getCellType()) {
                case NUMERIC -> BigDecimal.valueOf(cell.getNumericCellValue());
                case STRING -> new BigDecimal(cell.getStringCellValue().trim());
                case FORMULA -> formulaDecimal(evaluator.evaluate(cell), header);
                default -> throw new NumberFormatException();
            };
            BigDecimal significant = value.stripTrailingZeros();
            if (Math.max(significant.scale(), 0) > 4 || significant.precision() > 19) {
                throw new IllegalArgumentException(header + " must fit numeric(19,4)");
            }
            return value;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(header + " must be a decimal number");
        }
    }

    private BigDecimal formulaDecimal(CellValue value, String header) {
        if (value == null || value.getCellType() != CellType.NUMERIC) {
            throw new IllegalArgumentException(header + " formula must calculate a decimal number");
        }
        return BigDecimal.valueOf(value.getNumberValue());
    }

    private Instant timestamp(Cell cell, DataFormatter formatter, FormulaEvaluator evaluator, ImportProfile profile) {
        if (cell == null || cell.getCellType() == CellType.BLANK) {
            throw new IllegalArgumentException("Çek_tarixi is required");
        }
        ZoneId zone = ZoneId.of(profile.getZoneId());
        if (cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
            return cell.getLocalDateTimeCellValue().atZone(zone).toInstant();
        }
        String value = cellText(cell, formatter, evaluator);
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException ignored) {
        }
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeParseException ignored) {
        }
        try {
            return LocalDateTime.parse(value).atZone(zone).toInstant();
        } catch (DateTimeParseException exception) {
            throw new IllegalArgumentException("Çek_tarixi must be an Excel date or ISO-8601 timestamp");
        }
    }

    private int positiveInteger(String value, String header) {
        try {
            int number = new BigDecimal(value).intValueExact();
            if (number <= 0) throw new ArithmeticException();
            return number;
        } catch (NumberFormatException | ArithmeticException exception) {
            throw new IllegalArgumentException(header + " must be a positive whole number");
        }
    }

    private String bounded(String value, int maximum, String header) {
        if (value.length() > maximum) {
            throw new IllegalArgumentException(header + " exceeds " + maximum + " characters");
        }
        return value;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private IngestionAnalysis failure(int rows, Set<String> headers, String error) {
        return new IngestionAnalysis(
            "CLOUDSALE_OBSERVED",
            "CloudSale workbook adapter",
            rows,
            headers,
            FIELD_MAP,
            List.of(),
            List.of(error)
        );
    }

    private record ReceiptIdentity(String storeId, String registerId, String receiptId) {
    }

    private record AdaptedLine(
        String registerId,
        String sourceReceiptId,
        int lineNumber,
        ParsedTransactionLine line
    ) {
    }
}
