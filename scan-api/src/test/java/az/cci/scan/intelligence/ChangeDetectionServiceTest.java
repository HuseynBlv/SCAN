package az.cci.scan.intelligence;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.importing.ImportService;
import az.cci.scan.intelligence.ChangeDetectionDtos.NetworkChange;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductChange;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.FieldTaskRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportPreviewRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.InvestigationRepository;
import az.cci.scan.repository.WatchlistItemRepository;
import az.cci.scan.repository.OperationalAuditEventRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerOfferActivationRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.ScanAccountRepository;
import az.cci.scan.repository.StoreRepository;
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
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the recent-vs-prior comparison is computed from real, constructed basket data - not
 * asserted from a fixture that merely looks plausible. "Store A" is built so that it genuinely
 * stops carrying Sprite between the two windows while "Store B" stays flat, so the availability
 * and concentration signals in {@link ChangeDetectionService} are exercised by a real decline,
 * not a hand-picked boolean.
 */
@SpringBootTest
class ChangeDetectionServiceTest {

    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String STORE_A = "STORE-A";
    private static final String STORE_B = "STORE-B";
    private static final int PERIOD_DAYS = 14;

    @Autowired
    private ImportService importService;

    @Autowired
    private ChangeDetectionService changeDetectionService;

    @Autowired
    private FieldTaskRepository fieldTaskRepository;

    @Autowired
    private InvestigationRepository investigationRepository;

    @Autowired
    private WatchlistItemRepository watchlistItemRepository;

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
        fieldTaskRepository.deleteAll();
        watchlistItemRepository.deleteAll();
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
        canonicalProductRepository.save(new CanonicalProduct(
            "Fanta Orange 500ml", "5000112611397", "CCI", "CCI", "Beverages", null, null, null, true
        ));

        retailer = retailerRepository.save(new Retailer("CHANGE", "Change Detection Test Shop", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(
            retailer, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
        receiptCounter = 0;
    }

    @Test
    void findsARealNetworkWidePenetrationDrop() {
        importDecliningSpriteFixture();

        NetworkChange change = changeDetectionService.networkChange(retailer, PERIOD_DAYS);

        // 2 stores x 10 baskets each, both windows.
        assertThat(change.recentBaskets()).isEqualTo(20);
        assertThat(change.priorBaskets()).isEqualTo(20);
        // Prior: 6 Sprite baskets per store x 2 = 12. Recent: Store A drops to 0, Store B stays at 6.
        assertThat(change.priorCciBaskets()).isEqualTo(12);
        assertThat(change.recentCciBaskets()).isEqualTo(6);
        assertThat(change.priorPenetrationPct()).isEqualTo(60.0);
        assertThat(change.recentPenetrationPct()).isEqualTo(30.0);
        assertThat(change.penetrationPointChange()).isEqualTo(-30.0);
    }

    @Test
    void identifiesTheBiggestDeclinerAndOmitsThinSamples() {
        importDecliningSpriteFixture();
        // Fanta stays flat (3 baskets prior, 3 recent) - below MIN_SAMPLE_FOR_TREND, so it must
        // not be reported as a "decline" at all, real or not.
        importFlatFantaFixtureBelowSupportFloor();

        List<ProductMover> decliners = changeDetectionService.biggestDecliners(retailer, PERIOD_DAYS, 5);

        assertThat(decliners).hasSize(1);
        ProductMover sprite = decliners.get(0);
        assertThat(sprite.productName()).isEqualTo("Sprite 500ml");
        assertThat(sprite.priorBaskets()).isEqualTo(12);
        assertThat(sprite.recentBaskets()).isEqualTo(6);
        assertThat(sprite.basketChangePct()).isEqualTo(-50.0);
    }

    @Test
    void computesStoreContributionsAndBothHonestSignals() {
        importDecliningSpriteFixture();

        ProductChange change = changeDetectionService.compareProduct(retailer, "Sprite 500ml", PERIOD_DAYS);

        assertThat(change.recentBaskets()).isEqualTo(6);
        assertThat(change.priorBaskets()).isEqualTo(12);
        assertThat(change.basketChangePct()).isEqualTo(-50.0);

        Optional<ChangeDetectionDtos.StoreContribution> storeA = change.storeContributions().stream()
            .filter(c -> c.externalStoreId().equals(STORE_A))
            .findFirst();
        assertThat(storeA).isPresent();
        assertThat(storeA.get().recentProductBaskets()).isZero();
        assertThat(storeA.get().priorProductBaskets()).isEqualTo(6);

        Optional<ChangeDetectionDtos.StoreContribution> storeB = change.storeContributions().stream()
            .filter(c -> c.externalStoreId().equals(STORE_B))
            .findFirst();
        assertThat(storeB).isPresent();
        assertThat(storeB.get().recentProductBaskets()).isEqualTo(6);
        assertThat(storeB.get().priorProductBaskets()).isEqualTo(6);

        // Store A alone explains the entire decline and went from meaningful presence to none -
        // both signals should fire, and neither should be silently fabricated for Store B.
        assertThat(change.availabilitySignal()).isTrue();
        assertThat(change.availabilityEvidence()).contains(STORE_A);
        assertThat(change.concentrationSignal()).isTrue();
        assertThat(change.concentrationEvidence()).contains(STORE_A);
    }

    @Test
    void reportsNoSignalsWhenTheDeclineIsSpreadEvenlyAcrossStores() {
        // Both stores lose exactly one Sprite basket each - a real decline, but nothing concentrated
        // and nothing that drops to zero, so neither signal should fire.
        List<LocalDate> priorDates = datesAgo(16, 21);
        List<LocalDate> recentDates = datesAgo(1, 6);
        StringBuilder csv = new StringBuilder(header());
        for (int i = 0; i < 6; i++) {
            csv.append(spriteRow(STORE_A, priorDates.get(i).atTime(12, 0)));
            csv.append(spriteRow(STORE_B, priorDates.get(i).atTime(12, 0)));
        }
        for (int i = 0; i < 5; i++) {
            csv.append(spriteRow(STORE_A, recentDates.get(i).atTime(12, 0)));
            csv.append(spriteRow(STORE_B, recentDates.get(i).atTime(12, 0)));
        }
        importCsv(csv.toString());

        ProductChange change = changeDetectionService.compareProduct(retailer, "Sprite 500ml", PERIOD_DAYS);

        assertThat(change.recentBaskets()).isEqualTo(10);
        assertThat(change.priorBaskets()).isEqualTo(12);
        assertThat(change.availabilitySignal()).isFalse();
        assertThat(change.concentrationSignal()).isFalse();
    }

    /**
     * Store A: 6 Sprite + 4 filler baskets in the prior window, then 0 Sprite + 10 filler in the
     * recent window (real stockout-shaped drop). Store B: 6 Sprite + 4 filler in both windows
     * (flat). 10 total baskets per store per window throughout.
     */
    private void importDecliningSpriteFixture() {
        // The recent window starts exactly 14 days before the latest (anchor) timestamp and
        // includes that boundary instant, so prior-window dates must stay strictly older than
        // day 15 to avoid landing on the shared edge between the two windows.
        List<LocalDate> priorDates = datesAgo(16, 28);
        List<LocalDate> recentDates = datesAgo(1, 13);
        StringBuilder csv = new StringBuilder(header());

        for (int i = 0; i < 6; i++) {
            csv.append(spriteRow(STORE_A, priorDates.get(i).atTime(12, 0)));
            csv.append(spriteRow(STORE_B, priorDates.get(i).atTime(12, 0)));
        }
        for (int i = 6; i < 10; i++) {
            csv.append(fillerRow(STORE_A, priorDates.get(i).atTime(12, 0)));
            csv.append(fillerRow(STORE_B, priorDates.get(i).atTime(12, 0)));
        }
        for (int i = 0; i < 10; i++) {
            csv.append(fillerRow(STORE_A, recentDates.get(i).atTime(12, 0)));
        }
        for (int i = 0; i < 6; i++) {
            csv.append(spriteRow(STORE_B, recentDates.get(i).atTime(12, 0)));
        }
        for (int i = 6; i < 10; i++) {
            csv.append(fillerRow(STORE_B, recentDates.get(i).atTime(12, 0)));
        }
        importCsv(csv.toString());
    }

    private void importFlatFantaFixtureBelowSupportFloor() {
        List<LocalDate> priorDates = datesAgo(16, 18);
        List<LocalDate> recentDates = datesAgo(2, 4);
        StringBuilder csv = new StringBuilder(header());
        for (LocalDate date : priorDates) {
            csv.append(fantaRow(STORE_A, date.atTime(9, 0)));
        }
        for (LocalDate date : recentDates) {
            csv.append(fantaRow(STORE_A, date.atTime(9, 0)));
        }
        importCsv(csv.toString());
    }

    private List<LocalDate> datesAgo(int startInclusive, int endInclusive) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        return java.util.stream.IntStream.rangeClosed(startInclusive, endInclusive)
            .mapToObj(today::minusDays)
            .toList();
    }

    private String header() {
        return "store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total\n";
    }

    private String spriteRow(String storeId, LocalDateTime timestamp) {
        receiptCounter++;
        return storeId + ",R-" + receiptCounter + "," + TIMESTAMP_FORMAT.format(timestamp)
            + ",SPRITE,5449000015101,Sprite 500ml,1,2.50,0.00,2.50\n";
    }

    private String fantaRow(String storeId, LocalDateTime timestamp) {
        receiptCounter++;
        return storeId + ",R-" + receiptCounter + "," + TIMESTAMP_FORMAT.format(timestamp)
            + ",FANTA,5000112611397,Fanta Orange 500ml,1,3.00,0.00,3.00\n";
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
