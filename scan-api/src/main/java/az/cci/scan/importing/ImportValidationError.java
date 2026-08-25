package az.cci.scan.importing;

public record ImportValidationError(int rowNumber, String field, String message) {
    @Override
    public String toString() {
        if (rowNumber <= 0) {
            return field + ": " + message;
        }
        return "row " + rowNumber + ", " + field + ": " + message;
    }
}
