package az.cci.scan.importing;

import java.util.List;

public record RowMappingResult(
    List<ParsedTransactionLine> lines,
    List<ImportValidationError> errors
) {
    public boolean isValid() {
        return errors.isEmpty();
    }
}
