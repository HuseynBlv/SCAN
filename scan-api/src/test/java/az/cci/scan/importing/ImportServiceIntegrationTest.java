package az.cci.scan.importing;

import az.cci.scan.analytics.AnalyticsDataException;
import az.cci.scan.analytics.AnalyticsService;
import az.cci.scan.catalog.ProductMappingService;
import az.cci.scan.catalog.ProductCatalogImportService;
import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.RetailerProduct;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

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
    private ProductCatalogImportService productCatalogImportService;

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
        assertThat(first.attemptNumber()).isEqualTo(1);
        assertThat(first.importedReceipts()).isEqualTo(6);
        assertThat(first.importedLines()).isEqualTo(11);
        assertThat(first.unresolvedProducts()).isZero();
        assertThat(first.errors()).isEmpty();
        assertThat(duplicate.duplicateFile()).isTrue();
        assertThat(duplicate.id()).isEqualTo(first.id());
        assertThat(duplicate.attemptNumber()).isEqualTo(1);
        assertThat(importJobRepository.count()).isEqualTo(1);
        assertThat(receiptRepository.count()).isEqualTo(6);
    }

    @Test
    void retriesAFailedFileAsANewAuditableAttempt() {
        String invalid = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-03,R-3002,not-a-date,CHIPS-45,5053990109332,Chips 45g,wrong,1.20,0.00,1.20
            """;

        var first = importService.importFile("DEMO", "CANONICAL", csv("invalid.csv", invalid));
        var retry = importService.importFile("DEMO", "CANONICAL", csv("invalid.csv", invalid));

        assertThat(first.status()).isEqualTo(ImportJob.Status.FAILED);
        assertThat(first.attemptNumber()).isEqualTo(1);
        assertThat(retry.status()).isEqualTo(ImportJob.Status.FAILED);
        assertThat(retry.duplicateFile()).isFalse();
        assertThat(retry.id()).isNotEqualTo(first.id());
        assertThat(retry.attemptNumber()).isEqualTo(2);
        assertThat(importJobRepository.count()).isEqualTo(2);
        assertThat(receiptRepository.count()).isZero();
    }

    @Test
    void coalescesConcurrentIdenticalImportsIntoOneJob() throws Exception {
        byte[] bytes = canonicalFixture().getBytes();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> {
                ready.countDown();
                start.await();
                return importService.importFile(
                    "DEMO",
                    "CANONICAL",
                    new MockMultipartFile("file", "same.csv", "text/csv", bytes)
                );
            });
            var second = executor.submit(() -> {
                ready.countDown();
                start.await();
                return importService.importFile(
                    "DEMO",
                    "CANONICAL",
                    new MockMultipartFile("file", "same.csv", "text/csv", bytes)
                );
            });

            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            List<ImportDtos.ImportJobResponse> results = List.of(
                first.get(15, TimeUnit.SECONDS),
                second.get(15, TimeUnit.SECONDS)
            );

            assertThat(results).filteredOn(ImportDtos.ImportJobResponse::duplicateFile).hasSize(1);
            assertThat(results).extracting(ImportDtos.ImportJobResponse::id)
                .containsOnly(results.getFirst().id());
            assertThat(importJobRepository.count()).isEqualTo(1);
            assertThat(receiptRepository.count()).isEqualTo(6);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void doesNotDuplicateAnIdenticalReceiptFromAnOverlappingExport() throws IOException {
        importService.importFile("DEMO", "CANONICAL", canonicalFixture());
        String overlap = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-01,R-1001,2026-08-22T18:45:00,COKE-500,5449000000996,Coca-Cola 500ml,1.0000,1.5000,0.0000,1.5000
            STORE-01,R-1001,2026-08-22T18:45:00,CHIPS-45,5053990109332,Chips 45g,1.0000,1.2000,0.2000,1.0000
            """;

        var result = importService.importFile(
            "DEMO",
            "CANONICAL",
            csv("overlapping-export.csv", overlap)
        );

        assertThat(result.status()).isEqualTo(ImportJob.Status.COMPLETED);
        assertThat(result.duplicateFile()).isFalse();
        assertThat(result.importedReceipts()).isZero();
        assertThat(result.importedLines()).isZero();
        assertThat(result.duplicateReceipts()).isEqualTo(1);
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
    void rejectsDecimalsThatCannotFitTheCanonicalNumericType() {
        String invalid = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-03,R-3101,2026-08-24T10:00:00,COKE-500,5449000000996,Coca-Cola 500ml,1.00001,-1.50,0.00,1.50
            STORE-03,R-3102,2026-08-24T10:01:00,CHIPS-45,5053990109332,Chips 45g,1,1234567890123456.0000,0.00,1.20
            """;

        var result = importService.importFile(
            "DEMO",
            "CANONICAL",
            csv("invalid-decimals.csv", invalid)
        );

        assertThat(result.status()).isEqualTo(ImportJob.Status.FAILED);
        assertThat(result.errors()).anyMatch(error -> error.contains("at most 4 decimal places"));
        assertThat(result.errors()).anyMatch(error -> error.contains("must not be negative"));
        assertThat(result.errors()).anyMatch(error -> error.contains("numeric(19,4)"));
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
        assertThat(result.importedReceipts()).isZero();
        assertThat(result.importedLines()).isZero();
        assertThat(result.duplicateReceipts()).isZero();
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
        assertThat(overview.topCompanionCategories())
            .extracting(category -> category.category())
            .containsExactly("Snacks", "Bakery");
        assertThat(overview.topCompanionCategories().getFirst().basketCount()).isEqualTo(3);
        assertThat(overview.topCompanionCategories().getFirst().attachmentRatePercentage())
            .isEqualByComparingTo("60.0");
        assertThat(overview.cciSkuPerformance().getFirst().product()).isEqualTo("Coca-Cola 500ml");
        assertThat(overview.cciSkuPerformance().getFirst().productId()).isNotNull();
        assertThat(overview.cciSkuPerformance().getFirst().basketCount()).isEqualTo(4);
        assertThat(overview.cciSkuPerformance().getFirst().quantity()).isEqualByComparingTo("4.0000");
        assertThat(overview.cciSkuPerformance().getFirst().revenue()).isEqualByComparingTo("6.0000");
        assertThat(overview.dayparts())
            .filteredOn(segment -> segment.segment().equals("EVENING"))
            .singleElement()
            .satisfies(segment -> assertThat(segment.sharePercentage()).isEqualByComparingTo("50.0"));
        assertThat(overview.weekdayWeekend()).singleElement().satisfies(segment -> {
            assertThat(segment.segment()).isEqualTo("WEEKEND");
            assertThat(segment.basketCount()).isEqualTo(6);
            assertThat(segment.sharePercentage()).isEqualByComparingTo("100.0");
        });
        assertThat(overview.stores()).extracting(store -> store.storeId())
            .containsExactly("STORE-01", "STORE-02");
        assertThat(overview.stores().getFirst().basketCount()).isEqualTo(3);
        assertThat(overview.stores().getFirst().cciPenetrationPercentage())
            .isEqualByComparingTo("100.0");
        assertThat(overview.stores().getFirst().averageBasketValue()).isEqualByComparingTo("2.50");
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
        var overviewBeforeMapping = analyticsService.overview("DEMO", true);
        var unresolved = productMappingService.unresolved("DEMO");
        var chips = canonicalProductRepository.findByBarcode("5053990109332").orElseThrow();
        var mapped = productMappingService.map(unresolved.getFirst().id(), chips.getId());

        assertThat(imported.unresolvedProducts()).isEqualTo(1);
        assertThat(overviewBeforeMapping.mappedLinePercentage()).isEqualByComparingTo("0.0");
        assertThat(overviewBeforeMapping.cciBaskets()).isZero();
        assertThat(overviewBeforeMapping.topCompanionProducts()).isEmpty();
        assertThat(unresolved).singleElement().satisfies(product -> {
            assertThat(product.originalProductName()).isEqualTo("Local Snack");
            assertThat(product.canonicalProduct()).isNull();
        });
        assertThat(mapped.matchMethod()).isEqualTo("MANUAL");
        assertThat(productMappingService.unresolved("DEMO")).isEmpty();
    }

    @Test
    void countsRepeatedProductLinesOncePerCompanionBasketAndSumsSkuValues() {
        String repeatedLines = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-01,R-9100,2026-08-24T18:00:00,COKE-500,5449000000996,Coca-Cola 500ml,1,1.50,0.00,1.50
            STORE-01,R-9100,2026-08-24T18:00:00,COKE-500,5449000000996,Coca-Cola 500ml,2,1.50,0.00,3.00
            STORE-01,R-9100,2026-08-24T18:00:00,CHIPS-45,5053990109332,Chips 45g,1,1.20,0.00,1.20
            STORE-01,R-9100,2026-08-24T18:00:00,CHIPS-45,5053990109332,Chips 45g,1,1.20,0.00,1.20
            """;

        importService.importFile("DEMO", "CANONICAL", csv("repeated-lines.csv", repeatedLines));
        var overview = analyticsService.overview("DEMO", true);

        assertThat(overview.topCompanionProducts()).singleElement().satisfies(companion -> {
            assertThat(companion.basketCount()).isEqualTo(1);
            assertThat(companion.attachmentRatePercentage()).isEqualByComparingTo("100.0");
        });
        assertThat(overview.cciSkuPerformance()).singleElement().satisfies(sku -> {
            assertThat(sku.basketCount()).isEqualTo(1);
            assertThat(sku.quantity()).isEqualByComparingTo("3.0000");
            assertThat(sku.revenue()).isEqualByComparingTo("4.5000");
        });
    }

    @Test
    void returnsSafeZeroMetricsWhenNoReceiptsExist() {
        var overview = analyticsService.overview("DEMO", true);

        assertThat(overview.totalBaskets()).isZero();
        assertThat(overview.cciPenetrationPercentage()).isEqualByComparingTo("0.0");
        assertThat(overview.averageBasketValue()).isEqualByComparingTo("0.00");
        assertThat(overview.currency()).isEqualTo("N/A");
        assertThat(overview.mappedLinePercentage()).isEqualByComparingTo("0.0");
        assertThat(overview.topCompanionProducts()).isEmpty();
        assertThat(overview.stores()).isEmpty();
    }

    @Test
    void refusesToAggregateReceiptsAcrossCurrencies() {
        importService.importFile("DEMO", "CANONICAL", csv("azn.csv", """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-01,R-AZN,2026-08-24T10:00:00,COKE-500,5449000000996,Coca-Cola 500ml,1,1.50,0.00,1.50
            """));
        Retailer retailer = retailerRepository.findByCodeIgnoreCase("DEMO").orElseThrow();
        importProfileRepository.save(new ImportProfile(
            retailer,
            "USD_PROFILE",
            "synthetic-usd-v1",
            "yyyy-MM-dd'T'HH:mm:ss",
            "Asia/Baku",
            "USD"
        ));
        importService.importFile("DEMO", "USD_PROFILE", csv("usd.csv", """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-01,R-USD,2026-08-24T10:01:00,COKE-500,5449000000996,Coca-Cola 500ml,1,1.50,0.00,1.50
            """));

        assertThatThrownBy(() -> analyticsService.overview("DEMO", true))
            .isInstanceOf(AnalyticsDataException.class)
            .hasMessageContaining("AZN, USD");
    }

    @Test
    void canonicalProductIdentityIsUniqueIgnoringCaseAndOuterWhitespace() {
        assertThatThrownBy(() -> canonicalProductRepository.saveAndFlush(new CanonicalProduct(
            "  coca-cola 500ML  ",
            null,
            "CCI",
            "CCI",
            "Beverages",
            null,
            null,
            null,
            true
        )))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(canonicalProductRepository.count()).isEqualTo(4);
    }

    @Test
    void importsAnExactNameCatalogIdempotentlyBeforeTransactionIngestion() {
        String catalog = """
            source_product_name,normalized_name,barcode,brand,manufacturer,category,subcategory,package_size,package_type,is_cci
            FANTA 1LT,FANTA 1LT,,Fanta,,Kolalar,,,,true
            LOCAL CHIPS 45GR,LOCAL CHIPS 45GR,,,,Snacks,,,,false
            """;

        var firstCatalog = productCatalogImportService.importCatalog(
            "DEMO",
            csv("catalog.csv", catalog)
        );
        var repeatedCatalog = productCatalogImportService.importCatalog(
            "DEMO",
            csv("catalog.csv", catalog)
        );

        assertThat(firstCatalog.rows()).isEqualTo(2);
        assertThat(firstCatalog.createdCanonicalProducts()).isEqualTo(2);
        assertThat(firstCatalog.createdRetailerProducts()).isEqualTo(2);
        assertThat(firstCatalog.createdMappings()).isEqualTo(2);
        assertThat(repeatedCatalog.existingCanonicalProducts()).isEqualTo(2);
        assertThat(repeatedCatalog.existingMappings()).isEqualTo(2);

        String transactions = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            Zabrat,100,2019-07-19T12:29:00,,,FANTA 1LT,1,2.50,0,2.50
            Zabrat,100,2019-07-19T12:29:00,,,LOCAL CHIPS 45GR,1,1.20,0,1.20
            """;
        var imported = importService.importFile(
            "DEMO",
            "CANONICAL",
            csv("prepared-kaggle.csv", transactions)
        );
        var overview = analyticsService.overview("DEMO", true);

        assertThat(imported.status()).isEqualTo(ImportJob.Status.COMPLETED);
        assertThat(imported.unresolvedProducts()).isZero();
        assertThat(overview.totalBaskets()).isEqualTo(1);
        assertThat(overview.cciBaskets()).isEqualTo(1);
        assertThat(overview.mappedLinePercentage()).isEqualByComparingTo("100.0");
        assertThat(overview.topCompanionProducts()).singleElement().satisfies(companion -> {
            assertThat(companion.name()).isEqualTo("LOCAL CHIPS 45GR");
            assertThat(companion.attachmentRatePercentage()).isEqualByComparingTo("100.0");
        });
    }

    @Test
    void reusesABarcodeCatalogMappingWhenTransactionsAlsoContainAProductCode() {
        String catalog = """
            source_product_name,normalized_name,barcode,brand,manufacturer,category,subcategory,package_size,package_type,is_cci
            COKE RETAIL NAME,Coca-Cola 500ml,5449000000996,CCI,CCI,Beverages,,,,true
            """;
        productCatalogImportService.importCatalog("DEMO", csv("barcode-catalog.csv", catalog));

        String transaction = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-01,R-9200,2026-08-24T18:00:00,COKE-RETAIL,5449000000996,COKE RETAIL NAME,1,1.50,0.00,1.50
            """;
        var imported = importService.importFile(
            "DEMO",
            "CANONICAL",
            csv("barcode-transaction.csv", transaction)
        );

        assertThat(imported.unresolvedProducts()).isZero();
        assertThat(retailerProductRepository.count()).isEqualTo(1);
        assertThat(retailerProductRepository.findAll().getFirst().getMatchMethod())
            .isEqualTo(RetailerProduct.MatchMethod.SAVED_MAPPING);
    }

    @Test
    void preservesALegacyCodeMappingThroughCatalogAndTransactionImports() {
        Retailer retailer = retailerRepository.findByCodeIgnoreCase("DEMO").orElseThrow();
        CanonicalProduct coke = canonicalProductRepository.findByBarcode("5449000000996").orElseThrow();
        RetailerProduct legacy = new RetailerProduct(
            retailer,
            "CODE:LEGACY-COKE",
            "LEGACY-COKE",
            "5449000000996",
            "Legacy Coke"
        );
        legacy.mapTo(coke, RetailerProduct.MatchMethod.MANUAL);
        retailerProductRepository.save(legacy);

        String catalog = """
            source_product_name,normalized_name,barcode,brand,manufacturer,category,subcategory,package_size,package_type,is_cci
            COKE RETAIL NAME,Coca-Cola 500ml,5449000000996,CCI,CCI,Beverages,,,,true
            """;
        var catalogResult = productCatalogImportService.importCatalog(
            "DEMO",
            csv("legacy-barcode-catalog.csv", catalog)
        );

        String transaction = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-01,R-9300,2026-08-24T18:00:00,LEGACY-COKE,5449000000996,Legacy Coke,1,1.50,0.00,1.50
            """;
        var imported = importService.importFile(
            "DEMO",
            "CANONICAL",
            csv("legacy-code-transaction.csv", transaction)
        );

        assertThat(imported.unresolvedProducts()).isZero();
        assertThat(catalogResult.createdRetailerProducts()).isZero();
        assertThat(retailerProductRepository.count()).isEqualTo(1);
        assertThat(retailerProductRepository.findAll().getFirst().getProductKey())
            .isEqualTo("CODE:LEGACY-COKE");
        assertThat(retailerProductRepository.findAll().getFirst().getMatchMethod())
            .isEqualTo(RetailerProduct.MatchMethod.MANUAL);
    }

    @Test
    void rejectsABarcodeCatalogThatConflictsWithALegacyManualMapping() {
        Retailer retailer = retailerRepository.findByCodeIgnoreCase("DEMO").orElseThrow();
        CanonicalProduct chips = canonicalProductRepository.findByBarcode("5053990109332").orElseThrow();
        RetailerProduct legacy = new RetailerProduct(
            retailer, "CODE:LEGACY-COKE", "LEGACY-COKE", "5449000000996", "Legacy Product"
        );
        legacy.mapTo(chips, RetailerProduct.MatchMethod.MANUAL);
        retailerProductRepository.save(legacy);
        String catalog = """
            source_product_name,normalized_name,barcode,brand,manufacturer,category,subcategory,package_size,package_type,is_cci
            COKE RETAIL NAME,Coca-Cola 500ml,5449000000996,CCI,CCI,Beverages,,,,true
            """;

        assertThatThrownBy(() -> productCatalogImportService.importCatalog(
            "DEMO", csv("legacy-conflict.csv", catalog)
        )).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("mapping conflicts");
        assertThat(retailerProductRepository.count()).isEqualTo(1);
        assertThat(retailerProductRepository.findByRetailerAndProductKey(retailer, "CODE:LEGACY-COKE")
            .orElseThrow().getCanonicalProduct().getId()).isEqualTo(chips.getId());
    }

    @Test
    void rejectsConflictingCanonicalMetadataAndRollsBackTheCatalog() {
        String conflictingCatalog = """
            source_product_name,normalized_name,barcode,brand,manufacturer,category,subcategory,package_size,package_type,is_cci
            NEW PRODUCT,New Product,,,,Snacks,,,,false
            COKE WRONG,Coca-Cola 500ml,5449000000996,CCI,CCI,Beverages,,,,false
            """;

        assertThatThrownBy(() -> productCatalogImportService.importCatalog(
            "DEMO",
            csv("conflicting-catalog.csv", conflictingCatalog)
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("is_cci");
        assertThat(canonicalProductRepository.count()).isEqualTo(4);
        assertThat(retailerProductRepository.count()).isZero();
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
