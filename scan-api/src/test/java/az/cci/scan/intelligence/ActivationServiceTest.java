package az.cci.scan.intelligence;

import az.cci.scan.domain.Activation;
import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.importing.ImportService;
import az.cci.scan.intelligence.ActivationDtos.ActivationPerformance;
import az.cci.scan.repository.ActivationRepository;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.FieldTaskRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportPreviewRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.InvestigationRepository;
import az.cci.scan.repository.OperationalAuditEventRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerOfferActivationRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.ScanAccountRepository;
import az.cci.scan.repository.StoreRepository;
import az.cci.scan.repository.WatchlistItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Proves the test-vs-control comparison is a real difference-in-differences over real basket
 * data: test stores are built to genuinely gain Sprite penetration between the baseline and
 * activation windows while control stores stay flat, so the computed numbers - not a hand-picked
 * assertion - are what drive the honest, non-causal key finding.
 */
@SpringBootTest
class ActivationServiceTest {

    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String TEST_STORE_1 = "TEST-1";
    private static final String TEST_STORE_2 = "TEST-2";
    private static final String CONTROL_STORE_1 = "CONTROL-1";
    private static final String CONTROL_STORE_2 = "CONTROL-2";

    @Autowired
    private ImportService importService;

    @Autowired
    private ActivationService activationService;

    @Autowired
    private ActivationRepository cciActivationRepository;

    @Autowired
    private WatchlistItemRepository watchlistItemRepository;

    @Autowired
    private FieldTaskRepository fieldTaskRepository;

    @Autowired
    private InvestigationRepository investigationRepository;

    @Autowired
    private RetailerOfferActivationRepository activationRepository;

    @Autowired
    private OperationalAuditEventRepository auditEventRepository;

    @Autowired
    private ScanAccountRepository accountRepository;

    @Autowired
    private RetailerRepository retailerRepository;

    @Autowired
    private StoreRepository storeRepository;

    @Autowired
    private ImportProfileRepository importProfileRepository;

    @Autowired
    private ImportJobRepository importJobRepository;

    @Autowired
    private ImportPreviewRepository importPreviewRepository;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private RetailerProductRepository retailerProductRepository;

    @Autowired
    private CanonicalProductRepository canonicalProductRepository;

    private Retailer retailer;
    private int receiptCounter;

    @BeforeEach
    void setUp() {
        cciActivationRepository.deleteAll();
        watchlistItemRepository.deleteAll();
        fieldTaskRepository.deleteAll();
        investigationRepository.deleteAll();
        activationRepository.deleteAll();
        auditEventRepository.deleteAll();
        accountRepository.deleteAll();
        receiptRepository.deleteAll();
        retailerProductRepository.deleteAll();
        importJobRepository.deleteAll();
        importPreviewRepository.deleteAll();
        importProfileRepository.deleteAll();
        storeRepository.deleteAll();
        canonicalProductRepository.deleteAll();
        retailerRepository.deleteAll();

        canonicalProductRepository.save(new CanonicalProduct(
            "Sprite 500ml", "5449000015101", "CCI", "CCI", "Beverages", null, null, null, true
        ));

        retailer = retailerRepository.save(new Retailer("ACTIVATE", "Activation Test Shop", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(
            retailer, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
        receiptCounter = 0;
    }

    @Test
    void rejectsAnEndDateBeforeTheStartDate() {
        assertThatThrownBy(() -> activationService.create(
            retailer, "Sprite cooler push", "Increase Sprite visibility", "Cooler placement drives trial",
            "Sprite 500ml", Activation.PrimaryMetric.BASKET_PENETRATION,
            LocalDate.now(ZoneOffset.UTC), LocalDate.now(ZoneOffset.UTC).minusDays(1),
            List.of(TEST_STORE_1), List.of(CONTROL_STORE_1), "tester@example.com"
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAStoreAssignedToBothGroups() {
        assertThatThrownBy(() -> activationService.create(
            retailer, "Sprite cooler push", "Increase Sprite visibility", "Cooler placement drives trial",
            "Sprite 500ml", Activation.PrimaryMetric.BASKET_PENETRATION,
            LocalDate.now(ZoneOffset.UTC), LocalDate.now(ZoneOffset.UTC).plusDays(6),
            List.of(TEST_STORE_1), List.of(TEST_STORE_1), "tester@example.com"
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void computesARealUpliftForTestStoresAgainstFlatControlStores() {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate startDate = today.minusDays(10);
        LocalDate endDate = today.minusDays(4);
        importActivationFixture(startDate, endDate);

        Activation activation = activationService.create(
            retailer, "Sprite cooler push", "Increase Sprite visibility", "Cooler placement drives trial",
            "Sprite 500ml", Activation.PrimaryMetric.BASKET_PENETRATION, startDate, endDate,
            List.of(TEST_STORE_1, TEST_STORE_2), List.of(CONTROL_STORE_1, CONTROL_STORE_2), "tester@example.com"
        );

        assertThat(activation.status(java.time.Instant.now())).isEqualTo(Activation.Status.COMPLETED);

        ActivationPerformance performance = activationService.analyze(retailer, activation);

        assertThat(performance.test().baselinePenetrationPct()).isEqualTo(50.0);
        assertThat(performance.test().duringPenetrationPct()).isEqualTo(100.0);
        assertThat(performance.control().baselinePenetrationPct()).isEqualTo(50.0);
        assertThat(performance.control().duringPenetrationPct()).isEqualTo(50.0);
        assertThat(performance.testPenetrationPointChange()).isEqualTo(50.0);
        assertThat(performance.controlPenetrationPointChange()).isEqualTo(0.0);
        assertThat(performance.penetrationDifferenceInDifference()).isEqualTo(50.0);
        assertThat(performance.keyFinding()).contains("Test stores moved").contains("50.0 points more");
        assertThat(performance.limitations()).contains("not randomized").contains("2 test store(s) vs. 2 control store(s)");
        assertThat(performance.recommendation()).contains("not a randomized controlled test");
    }

    @Test
    void aDraftActivationReportsItHasNotStartedYet() {
        LocalDate startDate = LocalDate.now(ZoneOffset.UTC).plusDays(10);
        LocalDate endDate = startDate.plusDays(6);

        Activation activation = activationService.create(
            retailer, "Future push", "Increase Sprite visibility", "Cooler placement drives trial",
            "Sprite 500ml", Activation.PrimaryMetric.BASKET_PENETRATION, startDate, endDate,
            List.of(TEST_STORE_1), List.of(CONTROL_STORE_1), "tester@example.com"
        );

        assertThat(activation.status(java.time.Instant.now())).isEqualTo(Activation.Status.DRAFT);
        ActivationPerformance performance = activationService.analyze(retailer, activation);
        assertThat(performance.keyFinding()).isEqualTo("This activation has not started yet.");
        assertThat(performance.recommendation()).isNull();
    }

    /**
     * 4 baskets per store per window; test stores go from 2/4 Sprite baskets (baseline) to 4/4
     * (during); control stores stay at 2/4 in both windows.
     */
    private void importActivationFixture(LocalDate startDate, LocalDate endDate) {
        List<LocalDate> baselineDates = datesBetween(startDate.minusDays(7), startDate.minusDays(1));
        List<LocalDate> duringDates = datesBetween(startDate, endDate);
        StringBuilder csv = new StringBuilder(header());

        for (String store : List.of(TEST_STORE_1, TEST_STORE_2, CONTROL_STORE_1, CONTROL_STORE_2)) {
            for (int i = 0; i < 2; i++) csv.append(spriteRow(store, baselineDates.get(i).atTime(12, 0)));
            for (int i = 2; i < 4; i++) csv.append(fillerRow(store, baselineDates.get(i).atTime(12, 0)));
        }
        for (String store : List.of(TEST_STORE_1, TEST_STORE_2)) {
            for (int i = 0; i < 4; i++) csv.append(spriteRow(store, duringDates.get(i).atTime(12, 0)));
        }
        for (String store : List.of(CONTROL_STORE_1, CONTROL_STORE_2)) {
            for (int i = 0; i < 2; i++) csv.append(spriteRow(store, duringDates.get(i).atTime(12, 0)));
            for (int i = 2; i < 4; i++) csv.append(fillerRow(store, duringDates.get(i).atTime(12, 0)));
        }
        importCsv(csv.toString());
    }

    private List<LocalDate> datesBetween(LocalDate start, LocalDate end) {
        return start.datesUntil(end.plusDays(1)).toList();
    }

    private String header() {
        return "store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total\n";
    }

    private String spriteRow(String storeId, LocalDateTime timestamp) {
        receiptCounter++;
        return storeId + ",R-" + receiptCounter + "," + TIMESTAMP_FORMAT.format(timestamp)
            + ",SPRITE,5449000015101,Sprite 500ml,1,2.50,0.00,2.50\n";
    }

    private String fillerRow(String storeId, LocalDateTime timestamp) {
        receiptCounter++;
        return storeId + ",R-" + receiptCounter + "," + TIMESTAMP_FORMAT.format(timestamp)
            + ",WATER,0000000000000,Still Water 500ml,1,1.00,0.00,1.00\n";
    }

    private void importCsv(String csv) {
        importService.importFile(retailer.getCode(), "CANONICAL", new MockMultipartFile(
            "file", "fixture.csv", "text/csv", csv.getBytes()
        ));
    }
}
