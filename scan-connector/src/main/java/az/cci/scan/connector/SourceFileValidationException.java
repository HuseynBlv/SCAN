package az.cci.scan.connector;

final class SourceFileValidationException extends Exception {

    SourceFileValidationException(String message) {
        super(message);
    }

    SourceFileValidationException(String message, Throwable cause) {
        super(message, cause);
    }
}
