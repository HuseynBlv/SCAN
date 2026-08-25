package az.cci.scan.importing;

import az.cci.scan.domain.ImportProfile;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Component
public class CsvTransactionFileParser implements TransactionFileParser {

    @Override
    public boolean supports(String filename) {
        return filename != null && filename.toLowerCase(Locale.ROOT).endsWith(".csv");
    }

    @Override
    public ParsedTable parse(InputStream inputStream, ImportProfile profile) throws IOException {
        CSVFormat format = CSVFormat.RFC4180.builder()
            .setDelimiter(profile.delimiterCharacter())
            .setHeader()
            .setSkipHeaderRecord(true)
            .setIgnoreEmptyLines(true)
            .setTrim(true)
            .get();

        try (
            InputStreamReader reader = new InputStreamReader(inputStream, StandardCharsets.UTF_8);
            CSVParser parser = format.parse(reader)
        ) {
            Set<String> headers = new LinkedHashSet<>(parser.getHeaderNames());
            List<Map<String, String>> rows = new ArrayList<>();

            for (CSVRecord record : parser) {
                Map<String, String> row = new LinkedHashMap<>();
                for (String header : headers) {
                    row.put(header, record.isMapped(header) ? record.get(header).trim() : "");
                }
                rows.add(row);
            }

            return new ParsedTable(headers, rows);
        }
    }
}
