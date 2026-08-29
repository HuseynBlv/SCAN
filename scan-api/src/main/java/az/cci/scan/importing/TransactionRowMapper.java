package az.cci.scan.importing;

import az.cci.scan.domain.ImportProfile;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class TransactionRowMapper {

    public RowMappingResult map(ParsedTable table, ImportProfile profile) {
        List<ImportValidationError> errors = validateHeaders(table.headers(), profile.requiredColumns());
        if (!errors.isEmpty()) {
            return new RowMappingResult(List.of(), errors);
        }

        List<ParsedTransactionLine> lines = new ArrayList<>();
        for (int index = 0; index < table.rows().size(); index++) {
            int rowNumber = index + 2;
            Map<String, String> row = table.rows().get(index);
            mapRow(row, rowNumber, profile, lines, errors);
        }

        if (lines.isEmpty() && errors.isEmpty()) {
            errors.add(new ImportValidationError(0, "file", "contains no transaction rows"));
        }
        return new RowMappingResult(lines, errors);
    }

    private List<ImportValidationError> validateHeaders(Set<String> headers, Set<String> required) {
        List<ImportValidationError> errors = new ArrayList<>();
        for (String column : required) {
            if (!headers.contains(column)) {
                errors.add(new ImportValidationError(0, column, "required column is missing"));
            }
        }
        return errors;
    }

    private void mapRow(
        Map<String, String> row,
        int rowNumber,
        ImportProfile profile,
        List<ParsedTransactionLine> lines,
        List<ImportValidationError> errors
    ) {
        String storeId = required(row, profile.getStoreIdColumn(), rowNumber, errors);
        String receiptId = required(row, profile.getReceiptIdColumn(), rowNumber, errors);
        String timestampValue = required(row, profile.getTimestampColumn(), rowNumber, errors);
        String productName = required(row, profile.getProductNameColumn(), rowNumber, errors);
        BigDecimal quantity = decimal(row, profile.getQuantityColumn(), rowNumber, errors);
        BigDecimal unitPrice = decimal(row, profile.getUnitPriceColumn(), rowNumber, errors);
        BigDecimal discount = decimal(row, profile.getDiscountAmountColumn(), rowNumber, errors);
        BigDecimal lineTotal = decimal(row, profile.getLineTotalColumn(), rowNumber, errors);
        Instant timestamp = timestamp(timestampValue, profile, rowNumber, errors);
        String productCode = optional(row, profile.getProductCodeColumn());
        String barcode = optional(row, profile.getBarcodeColumn());

        if (quantity != null && quantity.signum() <= 0) {
            errors.add(new ImportValidationError(rowNumber, profile.getQuantityColumn(), "must be greater than zero"));
        }
        if (unitPrice != null && unitPrice.signum() < 0) {
            errors.add(new ImportValidationError(rowNumber, profile.getUnitPriceColumn(), "must not be negative"));
        }
        if (discount != null && discount.signum() < 0) {
            errors.add(new ImportValidationError(rowNumber, profile.getDiscountAmountColumn(), "must not be negative"));
        }
        if (lineTotal != null && lineTotal.signum() < 0) {
            errors.add(new ImportValidationError(rowNumber, profile.getLineTotalColumn(), "must not be negative"));
        }

        boolean rowValid = errors.stream().noneMatch(error -> error.rowNumber() == rowNumber);
        if (rowValid) {
            lines.add(new ParsedTransactionLine(
                rowNumber,
                storeId,
                receiptId,
                timestamp,
                productCode,
                barcode,
                productName,
                quantity,
                unitPrice,
                discount,
                lineTotal
            ));
        }
    }

    private String required(
        Map<String, String> row,
        String column,
        int rowNumber,
        List<ImportValidationError> errors
    ) {
        String value = row.getOrDefault(column, "").trim();
        if (value.isBlank()) {
            errors.add(new ImportValidationError(rowNumber, column, "value is required"));
            return null;
        }
        return value;
    }

    private String optional(Map<String, String> row, String column) {
        if (column == null || column.isBlank()) {
            return null;
        }
        String value = row.getOrDefault(column, "").trim();
        return value.isBlank() ? null : value;
    }

    private BigDecimal decimal(
        Map<String, String> row,
        String column,
        int rowNumber,
        List<ImportValidationError> errors
    ) {
        String value = required(row, column, rowNumber, errors);
        if (value == null) {
            return null;
        }
        try {
            BigDecimal normalized = new BigDecimal(value).setScale(4, RoundingMode.UNNECESSARY);
            if (normalized.precision() > 19) {
                errors.add(new ImportValidationError(
                    rowNumber,
                    column,
                    "exceeds the supported numeric(19,4) range"
                ));
                return null;
            }
            return normalized;
        } catch (NumberFormatException exception) {
            errors.add(new ImportValidationError(rowNumber, column, "must be a plain decimal number"));
            return null;
        } catch (ArithmeticException exception) {
            errors.add(new ImportValidationError(rowNumber, column, "must have at most 4 decimal places"));
            return null;
        }
    }

    private Instant timestamp(
        String value,
        ImportProfile profile,
        int rowNumber,
        List<ImportValidationError> errors
    ) {
        if (value == null) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException ignored) {
            // The retailer profile controls local timestamp parsing below.
        }
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeParseException ignored) {
            // The retailer profile controls local timestamp parsing below.
        }
        try {
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern(profile.getDateTimePattern());
            return LocalDateTime.parse(value, formatter)
                .atZone(ZoneId.of(profile.getZoneId()))
                .toInstant();
        } catch (java.time.DateTimeException exception) {
            errors.add(new ImportValidationError(
                rowNumber,
                profile.getTimestampColumn(),
                "does not match " + profile.getDateTimePattern() + " in " + profile.getZoneId()
            ));
            return null;
        }
    }
}
