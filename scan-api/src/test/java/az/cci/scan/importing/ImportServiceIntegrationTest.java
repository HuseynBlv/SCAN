package az.cci.scan.importing;

import az.cci.scan.analytics.AnalyticsService;
import az.cci.scan.catalog.ProductMappingService;
import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class ImportServiceIntegrationTest {

    @Autowired
    private ImportService importService;

    @Autowired
    private AnalyticsService analyticsService;

    @Autowired
    private ProductMappingService productMappingService;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private RetailerProductRepository retailerProductRepository;

    @Autowired
    private CanonicalProductRepository canonicalProductRepository;

    @Autowired
    private ImportJobRepository importJobRepository;

    @Autowired
    private ImportProfileRepository importProfileRepository;

    @Autowired
    private StoreRepository storeRepository;

    @Autowired
    private RetailerRepository retailerRepository;

    @BeforeEach
    void setUp() {
        receiptRepository.deleteAll();
        retailerProductRepository.deleteAll();
        importJobRepository.deleteAll();
        canonicalProductRepository.deleteAll();
        importProfileRepository.deleteAll();
        storeRepository.deleteAll();
        retailerRepository.deleteAll();

        Retailer retailer = retailerRepository.save(new Retailer(
            "DEMO",
            "Synthetic Phase 0 Retailer",
            "Asia/Baku",
            true
        ));
        importProfileRepository.save(new ImportProfile(
            retailer,
            "CANONICAL",
            "synthetic-canonical-v1",
            "yyyy-MM-dd'T'HH:mm:ss",
            "Asia/Baku",
            "AZN"
        ));
        saveCanonical("Coca-Cola 500ml", "5449000000996", "Beverages", true);
        saveCanonical("Fanta 500ml", "5449000126241", "Beverages", true);
        saveCanonical("Chips 45g", "5053990109332", "Snacks", false);
        saveCanonical("Bread", "2000000001008", "Bakery", false);
    }

    @Test
    void importsCanonicalCsvAndDoesNotDuplicateTheSameFile() throws IOException {
        MockMultipartFile file = canonicalFixture();

        var first = importService.importFile("DEMO", "CANONICAL", file);
        var duplicate = importService.importFile("DEMO", "CANONICAL", canonicalFixture());

        assertThat(first.status()).isEqualTo(ImportJob.Status.COMPLETED);
        assertThat(first.importedReceipts()).isEqualTo(6);
        assertThat(first.importedLines()).isEqualTo(11);
        assertThat(first.unresolvedProducts()).isZero();
        assertThat(first.errors()).isEmpty();
        assertThat(duplicate.duplicateFile()).isTrue();
        assertThat(duplicate.id()).isEqualTo(first.id());
        assertThat(receiptRepository.count()).isEqualTo(6);
    }

    @Test
    void rejectsTheWholeFileWhenAnyRowIsMalformed() {
        String invalid = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-03,R-3001,2026-08-24T10:00:00,COKE-500,5449000000996,Coca-Cola 500ml,1,1.50,0.00,1.50
            STORE-03,R-3002,not-a-date,CHIPS-45,5053990109332,Chips 45g,wrong,1.20,0.00,1.20
            """;

        var result = importService.importFile(
            "DEMO",
            "CANONICAL",
            csv("invalid.csv", invalid)
        );

        assertThat(result.status()).isEqualTo(ImportJob.Status.FAILED);
        assertThat(result.errors()).anyMatch(error -> error.contains("transaction_timestamp"));
        assertThat(result.errors()).anyMatch(error -> error.contains("plain decimal"));
        assertThat(receiptRepository.count()).isZero();
    }

    @Test
    void blocksCciAnalyticsWhenRetailerHasNotEnabledAggregateSharing() {
        retailerRepository.save(new Retailer(
            "PRIVATE",
            "Private Retailer",
            "Asia/Baku",
            false
        ));

        assertThatThrownBy(() -> analyticsService.overview("PRIVATE", true))
            .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
            .hasMessageContaining("not enabled");
    }

    @Test
    void rejectsAConflictingVersionOfAnExistingReceiptWithoutPartialWrites() throws IOException {
        importService.importFile("DEMO", "CANONICAL", canonicalFixture());
        String conflict = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-01,R-1001,2026-08-22T18:45:00,COKE-500,5449000000996,Coca-Cola 500ml,1,1.50,0.00,9.99
            STORE-03,R-3001,2026-08-24T10:00:00,COKE-500,5449000000996,Coca-Cola 500ml,1,1.50,0.00,1.50
            """;

        var result = importService.importFile(
            "DEMO",
            "CANONICAL",
            csv("conflicting-export.csv", conflict)
        );

        assertThat(result.status()).isEqualTo(ImportJob.Status.FAILED);
        assertThat(result.errors()).singleElement().asString().contains("different line contents");
        assertThat(receiptRepository.count()).isEqualTo(6);
        assertThat(storeRepository.findAll())
            .extracting(store -> store.getExternalStoreId())
            .doesNotContain("STORE-03");
    }

    @Test
    void calculatesDeterministicOverviewMetricsAndInsights() throws IOException {
        importService.importFile("DEMO", "CANONICAL", canonicalFixture());

        var overview = analyticsService.overview("DEMO", true);

        assertThat(overview.totalBaskets()).isEqualTo(6);
        assertThat(overview.cciBaskets()).isEqualTo(5);
        assertThat(overview.cciPenetrationPercentage()).isEqualByComparingTo("83.3");
        assertThat(overview.averageBasketValue()).isEqualByComparingTo("2.25");
        assertThat(overview.currency()).isEqualTo("AZN");
        assertThat(overview.mappedLinePercentage()).isEqualByComparingTo("100.0");
        assertThat(overview.topCompanionProducts().getFirst().name()).isEqualTo("Chips 45g");
        assertThat(overview.topCompanionProducts().getFirst().basketCount()).isEqualTo(3);
        assertThat(overview.topCompanionProducts().getFirst().attachmentRatePercentage())
            .isEqualByComparingTo("60.0");
        assertThat(overview.cciSkuPerformance().getFirst().product()).isEqualTo("Coca-Cola 500ml");
        assertThat(overview.cciSkuPerformance().getFirst().basketCount()).isEqualTo(4);
        assertThat(overview.dayparts())
            .filteredOn(segment -> segment.segment().equals("EVENING"))
            .singleElement()
            .satisfies(segment -> assertThat(segment.sharePercentage()).isEqualByComparingTo("50.0"));
        assertThat(overview.insights())
            .extracting(insight -> insight.fact())
            .anyMatch(fact -> fact.contains("60.0% of mapped CCI baskets"))
            .anyMatch(fact -> fact.contains("50.0% of validated baskets"));
    }

    @Test
    void leavesUnknownProductsUnmappedUntilAnExplicitManualMapping() {
        String unknown = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-01,R-9001,2026-08-24T10:00:00,LOCAL-1,9999999999999,Local Snack,1,0.90,0.00,0.90
            """;

        var imported = importService.importFile("DEMO", "CANONICAL", csv("unknown.csv", unknown));
        var unresolved = productMappingService.unresolved("DEMO");
        var chips = canonicalProductRepository.findByBarcode("5053990109332").orElseThrow();
        var mapped = productMappingService.map(unresolved.getFirst().id(), chips.getId());

        assertThat(imported.unresolvedProducts()).isEqualTo(1);
        assertThat(unresolved).singleElement().satisfies(product -> {
            assertThat(product.originalProductName()).isEqualTo("Local Snack");
            assertThat(product.canonicalProduct()).isNull();
        });
        assertThat(mapped.matchMethod()).isEqualTo("MANUAL");
        assertThat(productMappingService.unresolved("DEMO")).isEmpty();
    }

    private void saveCanonical(String name, String barcode, String category, boolean cci) {
        canonicalProductRepository.save(new CanonicalProduct(
            name,
            barcode,
            cci ? "CCI" : "Synthetic",
            cci ? "CCI" : "Synthetic",
            category,
            null,
            null,
            null,
            cci
        ));
    }

    private MockMultipartFile canonicalFixture() throws IOException {
        byte[] bytes = getClass().getResourceAsStream("/fixtures/canonical-transactions.csv")
            .readAllBytes();
        return new MockMultipartFile("file", "canonical-transactions.csv", "text/csv", bytes);
    }

    private MockMultipartFile csv(String filename, String contents) {
        return new MockMultipartFile(
            "file",
            filename,
            "text/csv",
            contents.getBytes(StandardCharsets.UTF_8)
        );
    }
}
