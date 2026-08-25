package az.cci.scan.importing;

import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class TransactionFileParserTest {

    private final Retailer retailer = new Retailer("TEST", "Test", "Asia/Baku", false);
    private final ImportProfile profile = new ImportProfile(
        retailer,
        "CANONICAL",
        "test",
        "yyyy-MM-dd'T'HH:mm:ss",
        "Asia/Baku",
        "AZN"
    );
    private final TransactionRowMapper rowMapper = new TransactionRowMapper();

    @Test
    void mapsCsvUsingProfileColumns() throws Exception {
        String csv = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-1,R-1,2026-08-22T18:45:00,SKU-1,1234567890123,Product,2,1.50,0.25,2.75
            """;
        var parser = new CsvTransactionFileParser();

        ParsedTable table = parser.parse(
            new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8)),
            profile
        );
        RowMappingResult result = rowMapper.map(table, profile);

        assertThat(result.errors()).isEmpty();
        assertThat(result.lines()).singleElement().satisfies(line -> {
            assertThat(line.sourceRowNumber()).isEqualTo(2);
            assertThat(line.storeId()).isEqualTo("STORE-1");
            assertThat(line.receiptId()).isEqualTo("R-1");
            assertThat(line.quantity()).isEqualByComparingTo("2");
            assertThat(line.lineTotal()).isEqualByComparingTo("2.75");
            assertThat(line.transactionTimestamp().toString()).isEqualTo("2026-08-22T14:45:00Z");
        });
    }

    @Test
    void mapsFirstWorksheetFromXlsx() throws Exception {
        byte[] workbookBytes;
        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("Transactions");
            var header = sheet.createRow(0);
            String[] headers = {
                "store_id", "receipt_id", "transaction_timestamp", "product_code", "barcode",
                "product_name", "quantity", "unit_price", "discount_amount", "line_total"
            };
            for (int index = 0; index < headers.length; index++) {
                header.createCell(index).setCellValue(headers[index]);
            }
            var row = sheet.createRow(1);
            String[] values = {
                "STORE-1", "R-1", "2026-08-22T18:45:00", "SKU-1", "1234567890123",
                "Product", "1", "1.50", "0.00", "1.50"
            };
            for (int index = 0; index < values.length; index++) {
                row.createCell(index).setCellValue(values[index]);
            }
            workbook.write(output);
            workbookBytes = output.toByteArray();
        }

        ParsedTable table = new XlsxTransactionFileParser().parse(
            new ByteArrayInputStream(workbookBytes),
            profile
        );
        RowMappingResult result = rowMapper.map(table, profile);

        assertThat(result.errors()).isEmpty();
        assertThat(result.lines()).singleElement()
            .extracting(ParsedTransactionLine::productName)
            .isEqualTo("Product");
    }

    @Test
    void reportsEveryMissingRequiredHeaderBeforeParsingRows() {
        ParsedTable table = new ParsedTable(java.util.Set.of("store_id"), java.util.List.of());

        RowMappingResult result = rowMapper.map(table, profile);

        assertThat(result.lines()).isEmpty();
        assertThat(result.errors())
            .extracting(ImportValidationError::field)
            .contains("receipt_id", "transaction_timestamp", "product_name", "line_total");
    }
}
