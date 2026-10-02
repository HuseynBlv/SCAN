package az.cci.scan.network;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.importing.ImportService;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
import az.cci.scan.network.NetworkDtos.BriefItem;
import az.cci.scan.network.NetworkDtos.CategoryMover;
import az.cci.scan.network.NetworkDtos.NetworkOverview;
import az.cci.scan.network.NetworkDtos.StoreRanking;
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

/**
 * Proves genuine cross-retailer aggregation, not single-retailer logic that happens to run twice:
 * the exact same stockout-shaped decline used throughout this codebase's single-retailer tests
 * (12 prior baskets -&gt; 6 recent, a real 50% drop) is built here split across TWO different
 * retailers' stores. If any query were still accidentally scoped to one retailer, these numbers
 * would come out wrong - they only add up correctly when the aggregation is real.
 */
@SpringBootTest
class NetworkAnalyticsServiceTest {

    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final int PERIOD_DAYS = 14;

    @Autowired
    private ImportService importService;

    @Autowired
    private NetworkAnalyticsService networkAnalyticsService;

    @Autowired
    private FieldTaskRepository fieldTaskRepository;

    @Autowired
    private ActivationRepository cciActivationRepository;

    @Autowired
    private WatchlistItemRepository watchlistItemRepository;

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

    private Retailer retailerA;
    private Retailer retailerB;
    private int receiptCounter;

    @BeforeEach
    void setUp() {
        fieldTaskRepository.deleteAll();
        cciActivationRepository.deleteAll();
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
            "Sprite 500ml", "5449000015101", "The Coca-Cola Company", "The Coca-Cola Company", "Beverages", null, null, null, true
        ));

        retailerA = retailerRepository.save(new Retailer("NET-A", "Network Test Shop A", "Asia/Baku", true));
        retailerB = retailerRepository.save(new Retailer("NET-B", "Network Test Shop B", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(
            retailerA, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
        importProfileRepository.save(new ImportProfile(
            retailerB, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
        receiptCounter = 0;
    }

    @Test
    void aggregatesANetworkWideDeclineAcrossTwoDifferentRetailers() {
        importDecliningSpriteAcrossTwoRetailers();

        NetworkOverview overview = networkAnalyticsService.overview(List.of(retailerA, retailerB), PERIOD_DAYS);

        // 2 retailers x 1 store x 10 baskets each, both windows.
        assertThat(overview.totalBaskets()).isEqualTo(20);
        assertThat(overview.storesReporting()).isEqualTo(2);
        // Prior: 6 Sprite baskets per store x 2 = 12. Recent: store A drops to 0, store B stays at 6.
        assertThat(overview.cciBaskets()).isEqualTo(6);
        assertThat(overview.priorCciPenetrationPct()).isEqualTo(60.0);
        assertThat(overview.cciPenetrationPct()).isEqualTo(30.0);
        assertThat(overview.penetrationPointChange()).isEqualTo(-30.0);
    }

    @Test
    void ranksStoresFromBothRetailersInOneFlatListWithTheirOwningRetailerCode() {
        importDecliningSpriteAcrossTwoRetailers();

        List<StoreRanking> ranking = networkAnalyticsService.storeRanking(List.of(retailerA, retailerB), PERIOD_DAYS);

        assertThat(ranking).hasSize(2);
        StoreRanking storeA = ranking.stream().filter(r -> r.retailerCode().equals("NET-A")).findFirst().orElseThrow();
        assertThat(storeA.externalStoreId()).isEqualTo("A-STORE-1");
        assertThat(storeA.recentPenetrationPct()).isEqualTo(0.0);
        assertThat(storeA.priorPenetrationPct()).isEqualTo(60.0);
        assertThat(storeA.status()).isEqualTo("NEEDS_ATTENTION");

        StoreRanking storeB = ranking.stream().filter(r -> r.retailerCode().equals("NET-B")).findFirst().orElseThrow();
        assertThat(storeB.externalStoreId()).isEqualTo("B-STORE-1");
        assertThat(storeB.recentPenetrationPct()).isEqualTo(60.0);
        assertThat(storeB.status()).isEqualTo("STABLE");
    }

    @Test
    void combinesProductCountsAcrossRetailersIntoOneNetworkWideMover() {
        importDecliningSpriteAcrossTwoRetailers();

        List<ProductMover> movers = networkAnalyticsService.productMovers(List.of(retailerA, retailerB), PERIOD_DAYS, 10);

        assertThat(movers).hasSize(1);
        assertThat(movers.get(0).productName()).isEqualTo("Sprite 500ml");
        assertThat(movers.get(0).priorBaskets()).isEqualTo(12);
        assertThat(movers.get(0).recentBaskets()).isEqualTo(6);
        assertThat(movers.get(0).basketChangePct()).isEqualTo(-50.0);
    }

    @Test
    void groupsCategoryMoversAcrossRetailers() {
        importDecliningSpriteAcrossTwoRetailers();

        List<CategoryMover> movers = networkAnalyticsService.categoryMovers(List.of(retailerA, retailerB), PERIOD_DAYS, 10);

        assertThat(movers).hasSize(1);
        assertThat(movers.get(0).category()).isEqualTo("Beverages");
        assertThat(movers.get(0).priorBaskets()).isEqualTo(12);
        assertThat(movers.get(0).recentBaskets()).isEqualTo(6);
    }

    @Test
    void generatesARealDeclineBriefItemNamingBothAffectedStores() {
        importDecliningSpriteAcrossTwoRetailers();

        List<BriefItem> brief = networkAnalyticsService.commercialBrief(List.of(retailerA, retailerB), PERIOD_DAYS);

        assertThat(brief).anyMatch(item -> "IMPORTANT".equals(item.type()) && item.title().contains("SPRITE"));
        BriefItem decline = brief.stream().filter(item -> "IMPORTANT".equals(item.type())).findFirst().orElseThrow();
        assertThat(decline.description()).contains("50%").contains("1 stores");
        assertThat(decline.actionTarget()).isEqualTo("Sprite 500ml");
    }

    /**
     * Store A (retailer NET-A): 6 Sprite + 4 filler baskets prior, then 0 Sprite + 10 filler during
     * (a real stockout-shaped drop). Store B (retailer NET-B): 6 Sprite + 4 filler in both windows
     * (flat). 10 total baskets per store per window - same shape as ChangeDetectionServiceTest's
     * single-retailer fixture, deliberately split across two retailers here.
     */
    private void importDecliningSpriteAcrossTwoRetailers() {
        List<LocalDate> priorDates = datesAgo(16, 28);
        List<LocalDate> recentDates = datesAgo(1, 13);

        StringBuilder csvA = new StringBuilder(header());
        for (int i = 0; i < 6; i++) csvA.append(spriteRow("A-STORE-1", priorDates.get(i).atTime(12, 0)));
        for (int i = 6; i < 10; i++) csvA.append(fillerRow("A-STORE-1", priorDates.get(i).atTime(12, 0)));
        for (int i = 0; i < 10; i++) csvA.append(fillerRow("A-STORE-1", recentDates.get(i).atTime(12, 0)));
        importCsv(retailerA, csvA.toString());

        StringBuilder csvB = new StringBuilder(header());
        for (int i = 0; i < 6; i++) csvB.append(spriteRow("B-STORE-1", priorDates.get(i).atTime(12, 0)));
        for (int i = 6; i < 10; i++) csvB.append(fillerRow("B-STORE-1", priorDates.get(i).atTime(12, 0)));
        for (int i = 0; i < 6; i++) csvB.append(spriteRow("B-STORE-1", recentDates.get(i).atTime(12, 0)));
        for (int i = 6; i < 10; i++) csvB.append(fillerRow("B-STORE-1", recentDates.get(i).atTime(12, 0)));
        importCsv(retailerB, csvB.toString());
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

    private String fillerRow(String storeId, LocalDateTime timestamp) {
        receiptCounter++;
        return storeId + ",R-" + receiptCounter + "," + TIMESTAMP_FORMAT.format(timestamp)
            + ",WATER,0000000000000,Still Water 500ml,1,1.00,0.00,1.00\n";
    }

    private void importCsv(Retailer retailer, String csv) {
        importService.importFile(retailer.getCode(), "CANONICAL", new MockMultipartFile(
            "file", "fixture.csv", "text/csv", csv.getBytes()
        ));
    }
}
