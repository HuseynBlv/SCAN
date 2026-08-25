package az.cci.scan.importing;

import az.cci.scan.domain.ImportProfile;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Component
public class XlsxTransactionFileParser implements TransactionFileParser {

    @Override
    public boolean supports(String filename) {
        if (filename == null) {
            return false;
        }
        String normalized = filename.toLowerCase(Locale.ROOT);
        return normalized.endsWith(".xlsx") || normalized.endsWith(".xls");
    }

    @Override
    public ParsedTable parse(InputStream inputStream, ImportProfile profile) throws IOException {
        try (Workbook workbook = WorkbookFactory.create(inputStream)) {
            if (workbook.getNumberOfSheets() == 0) {
                return new ParsedTable(Set.of(), List.of());
            }

            Sheet sheet = workbook.getSheetAt(0);
            Row headerRow = sheet.getRow(sheet.getFirstRowNum());
            if (headerRow == null) {
                return new ParsedTable(Set.of(), List.of());
            }

            DataFormatter formatter = new DataFormatter(Locale.ROOT);
            List<String> orderedHeaders = new ArrayList<>();
            for (int column = 0; column < headerRow.getLastCellNum(); column++) {
                orderedHeaders.add(formatter.formatCellValue(headerRow.getCell(column)).trim());
            }

            Set<String> headers = new LinkedHashSet<>(orderedHeaders);
            List<Map<String, String>> rows = new ArrayList<>();
            for (int rowIndex = headerRow.getRowNum() + 1; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                Row row = sheet.getRow(rowIndex);
                if (row == null) {
                    continue;
                }

                Map<String, String> values = new LinkedHashMap<>();
                boolean hasValue = false;
                for (int column = 0; column < orderedHeaders.size(); column++) {
                    String value = formatter.formatCellValue(row.getCell(column)).trim();
                    values.put(orderedHeaders.get(column), value);
                    hasValue = hasValue || !value.isBlank();
                }
                if (hasValue) {
                    rows.add(values);
                }
            }

            return new ParsedTable(headers, rows);
        }
    }
}
