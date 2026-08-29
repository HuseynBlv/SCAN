package az.cci.scan.connector;

import java.io.IOException;
import java.nio.file.Path;

interface ImportClient {

    UploadResult upload(Path file) throws IOException, InterruptedException;

    record UploadResult(int statusCode, String responseBody) {

        boolean successful() {
            return statusCode >= 200 && statusCode < 300;
        }

        boolean retryable() {
            return statusCode == 401
                || statusCode == 403
                || statusCode == 408
                || statusCode == 425
                || statusCode == 429
                || statusCode >= 500;
        }
    }
}
