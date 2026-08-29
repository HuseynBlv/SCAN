package az.cci.scan.tools.kaggle;

import az.cci.scan.analytics.AnalyticsService;
import az.cci.scan.catalog.ProductCatalogImportService;
import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.importing.ImportService;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@EnabledIfSystemProperty(named = "scan.kaggle.output", matches = ".+")
class KagglePreparedDatasetSmokeTest {

    @Autowired
    private ProductCatalogImportService productCatalogImportService;

    @Autowired
    private ImportService importService;

    @Autowired
    private AnalyticsService analyticsService;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private RetailerProductRepository retailerProductRepository;

    @Autowired
    private ImportJobRepository importJobRepository;

    @Autowired
    private CanonicalProductRepository canonicalProductRepository;

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
            "KAGGLE",
            "Kaggle Supermarket Dataset 2019",
            "Asia/Baku",
            true
        ));
        importProfileRepository.save(new ImportProfile(
            retailer,
            "KAGGLE_2019",
            "kaggle-supermarket-2019",
            "yyyy-MM-dd'T'HH:mm:ss",
            "Asia/Baku",
            "AZN"
        ));
    }

    @Test
    void importsThePreparedExternalDatasetAndCalculatesAnalytics() throws IOException {
        Path output = Path.of(System.getProperty("scan.kaggle.output"));
        Path catalog = output.resolve(KaggleDatasetPreparer.CATALOG_FILENAME);
        Path transactions = output.resolve(KaggleDatasetPreparer.TRANSACTIONS_FILENAME);

        var catalogResult = productCatalogImportService.importCatalog(
            "KAGGLE",
            file(catalog)
        );
        var importResult = importService.importFile(
            "KAGGLE",
            "KAGGLE_2019",
            file(transactions)
        );
        long analyticsStartedAt = System.nanoTime();
        var overview = analyticsService.overview("KAGGLE", true);
        Duration analyticsDuration = Duration.ofNanos(System.nanoTime() - analyticsStartedAt);

        assertThat(catalogResult.rows()).isEqualTo(13_913);
        assertThat(importResult.status()).isEqualTo(ImportJob.Status.COMPLETED);
        assertThat(importResult.importedReceipts()).isEqualTo(10_000);
        assertThat(importResult.importedLines()).isEqualTo(54_848);
        assertThat(importResult.unresolvedProducts()).isZero();
        assertThat(overview.totalBaskets()).isEqualTo(10_000);
        assertThat(overview.cciBaskets()).isEqualTo(209);
        assertThat(overview.mappedLinePercentage()).isEqualByComparingTo("100.0");
        assertThat(overview.currency()).isEqualTo("AZN");
        assertThat(overview.topCompanionProducts()).isNotEmpty();
        assertThat(overview.topCompanionCategories()).isNotEmpty();
        assertThat(overview.stores()).hasSize(21);
        assertThat(analyticsDuration).isLessThan(Duration.ofSeconds(5));
    }

    private MockMultipartFile file(Path path) throws IOException {
        return new MockMultipartFile(
            "file",
            path.getFileName().toString(),
            "text/csv",
            Files.readAllBytes(path)
        );
    }
}
