package az.cci.scan.tools.kaggle;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

class KaggleDatasetPreparerTest {

    @TempDir
    private Path temporaryDirectory;

    @Test
    void preparesCanonicalTransactionsCatalogAndValidationReport() throws IOException {
        Path source = zip("""
            ,satish_kodu,mehsul_kodu,mehsul_ad,mehsul_kateqoriya,mehsul_qiymet,satish_tarixi,endirim_kompaniya,bonus_kart,magaza_ad,magaza_lat,magaza_long
            0,100,111,FANTA 1LT, Kolalar ,2.50,19/07/2019 12:29,Sərin Yay günləri,true,Zabrat,40.4,49.9
            1,100,222,LOCAL CHIPS 45GR, Şirniyyat ,1.20,19/07/2019 12:29,,true,Zabrat,40.4,49.9
            2,200,333,BREAD, Un məmulatları ,0.80,20/07/2019 09:15,,false,Yasamal,40.3,49.8
            3,200,444,,Un məmulatları,,20/07/2019 09:15,,false,Yasamal,40.3,49.8
            4,300,555,CAPPY 1LT ALMA, Meyvə Şirələri ,3.10,21/07/2019 18:01,Campaign,true,Xətai,40.4,49.9
            """);
        Path output = temporaryDirectory.resolve("prepared");

        var result = new KaggleDatasetPreparer().prepare(source, output, 0);

        assertThat(result.inputRows()).isEqualTo(5);
        assertThat(result.inputReceipts()).isEqualTo(3);
        assertThat(result.selectedReceipts()).isEqualTo(2);
        assertThat(result.outputLines()).isEqualTo(3);
        assertThat(result.malformedRows()).isEqualTo(1);
        assertThat(result.quarantinedReceipts()).isEqualTo(1);
        assertThat(result.quarantinedRows()).isEqualTo(2);
        assertThat(result.catalogProducts()).isEqualTo(3);
        assertThat(result.cciCatalogProducts()).isEqualTo(2);
        assertThat(result.cciReceipts()).isEqualTo(2);

        List<CSVRecord> transactions = records(result.transactionsFile());
        assertThat(transactions).hasSize(3);
        assertThat(transactions).allSatisfy(row -> {
            assertThat(row.get("product_code")).isBlank();
            assertThat(row.get("barcode")).isBlank();
            assertThat(row.get("quantity")).isEqualTo("1");
            assertThat(row.get("discount_amount")).isEqualTo("0");
            assertThat(row.get("line_total")).isEqualTo(row.get("unit_price"));
        });
        assertThat(transactions)
            .extracting(row -> row.get("receipt_id"))
            .containsExactly("100", "100", "300");
        assertThat(transactions.getFirst().get("transaction_timestamp"))
            .isEqualTo("2019-07-19T12:29:00");

        List<CSVRecord> catalog = records(result.catalogFile());
        assertThat(catalog).hasSize(3);
        assertThat(catalog)
            .filteredOn(row -> row.get("source_product_name").equals("FANTA 1LT"))
            .singleElement()
            .satisfies(row -> {
                assertThat(row.get("brand")).isEqualTo("Fanta");
                assertThat(row.get("category")).isEqualTo("Kolalar");
                assertThat(row.get("is_cci")).isEqualTo("true");
            });
        assertThat(catalog)
            .filteredOn(row -> row.get("source_product_name").equals("LOCAL CHIPS 45GR"))
            .singleElement()
            .satisfies(row -> assertThat(row.get("is_cci")).isEqualTo("false"));

        List<CSVRecord> rejections = records(result.rejectionsFile());
        assertThat(rejections).singleElement().satisfies(row -> {
            assertThat(row.get("receipt_id")).isEqualTo("200");
            assertThat(row.get("reason")).contains("mehsul_ad is required", "mehsul_qiymet is required");
        });

        JsonNode report = new ObjectMapper().readTree(result.reportFile().toFile());
        assertThat(report.get("currency").asText()).isEqualTo("AZN");
        assertThat(report.get("zoneId").asText()).isEqualTo("Asia/Baku");
        assertThat(report.get("quarantinedReceiptRows").asLong()).isEqualTo(2);
        assertThat(report.get("sourceProductCodePolicy").asText()).contains("omitted");
    }

    @Test
    void receiptLimitSelectsWholeBasketsDeterministically() throws IOException {
        Path source = zip("""
            ,satish_kodu,mehsul_kodu,mehsul_ad,mehsul_kateqoriya,mehsul_qiymet,satish_tarixi,endirim_kompaniya,bonus_kart,magaza_ad,magaza_lat,magaza_long
            0,100,111,A,Category,1.00,19/07/2019 12:29,,true,S1,40.4,49.9
            1,100,112,B,Category,1.00,19/07/2019 12:29,,true,S1,40.4,49.9
            2,200,113,C,Category,1.00,20/07/2019 12:29,,true,S1,40.4,49.9
            3,200,114,D,Category,1.00,20/07/2019 12:29,,true,S1,40.4,49.9
            4,300,115,E,Category,1.00,21/07/2019 12:29,,true,S1,40.4,49.9
            5,300,116,F,Category,1.00,21/07/2019 12:29,,true,S1,40.4,49.9
            """);
        Path first = temporaryDirectory.resolve("first");
        Path second = temporaryDirectory.resolve("second");

        var firstResult = new KaggleDatasetPreparer().prepare(source, first, 2);
        var secondResult = new KaggleDatasetPreparer().prepare(source, second, 2);

        assertThat(firstResult.selectedReceipts()).isEqualTo(2);
        assertThat(firstResult.outputLines()).isEqualTo(4);
        Set<String> receiptIds = records(firstResult.transactionsFile()).stream()
            .map(row -> row.get("receipt_id"))
            .collect(Collectors.toSet());
        assertThat(receiptIds).hasSize(2);
        assertThat(Files.readString(firstResult.transactionsFile()))
            .isEqualTo(Files.readString(secondResult.transactionsFile()));
        assertThat(Files.readString(firstResult.catalogFile()))
            .isEqualTo(Files.readString(secondResult.catalogFile()));
    }

    @Test
    void collapsesSourceNamesThatShareTheSameCaseInsensitiveMappingKey() throws IOException {
        Path source = zip("""
            ,satish_kodu,mehsul_kodu,mehsul_ad,mehsul_kateqoriya,mehsul_qiymet,satish_tarixi,endirim_kompaniya,bonus_kart,magaza_ad,magaza_lat,magaza_long
            0,100,111,BIZON 250ML ENERGY DRINK,Enerji içkiləri,1.00,19/07/2019 12:29,,true,S1,40.4,49.9
            1,200,222,Bızon 250ml Energy Drınk,Enerji içkiləri,1.00,20/07/2019 12:29,,true,S1,40.4,49.9
            """);

        var result = new KaggleDatasetPreparer().prepare(
            source,
            temporaryDirectory.resolve("case-collision"),
            0
        );

        assertThat(result.outputLines()).isEqualTo(2);
        assertThat(result.catalogProducts()).isEqualTo(1);
        assertThat(records(result.catalogFile()))
            .singleElement()
            .satisfies(row -> assertThat(row.get("source_product_name"))
                .isEqualTo("BIZON 250ML ENERGY DRINK"));
    }

    private Path zip(String csv) throws IOException {
        Path path = temporaryDirectory.resolve("source-" + System.nanoTime() + ".zip");
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(path))) {
            output.putNextEntry(new ZipEntry("esas_mehsullar.csv"));
            output.write(csv.getBytes(StandardCharsets.UTF_8));
            output.closeEntry();
        }
        return path;
    }

    private List<CSVRecord> records(Path path) throws IOException {
        CSVFormat format = CSVFormat.RFC4180.builder()
            .setHeader()
            .setSkipHeaderRecord(true)
            .get();
        try (
            Reader reader = new InputStreamReader(Files.newInputStream(path), StandardCharsets.UTF_8);
            CSVParser parser = format.parse(reader)
        ) {
            return parser.getRecords();
        }
    }
}
