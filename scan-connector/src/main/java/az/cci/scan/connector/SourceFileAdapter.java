package az.cci.scan.connector;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

interface SourceFileAdapter {

    PreparedUpload prepare(Path source) throws IOException, SourceFileValidationException;

    static SourceFileAdapter forConfig(ConnectorConfig config) {
        return switch (config.sourceFormat()) {
            case CANONICAL -> source -> new PreparedUpload(source, null, null);
            case CASPOS_CLOUDSALE_PROVISIONAL -> new CasposCloudSaleAdapter(config.workDirectory());
        };
    }

    record PreparedUpload(Path uploadFile, Path temporaryDirectory, String preparationMessage)
        implements AutoCloseable {

        @Override
        public void close() throws IOException {
            if (temporaryDirectory == null) {
                return;
            }
            Files.deleteIfExists(uploadFile);
            Files.deleteIfExists(temporaryDirectory);
        }
    }
}
