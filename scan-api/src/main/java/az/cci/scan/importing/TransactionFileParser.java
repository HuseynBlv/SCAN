package az.cci.scan.importing;

import az.cci.scan.domain.ImportProfile;

import java.io.IOException;
import java.io.InputStream;

public interface TransactionFileParser {
    boolean supports(String filename);

    ParsedTable parse(InputStream inputStream, ImportProfile profile) throws IOException;
}
