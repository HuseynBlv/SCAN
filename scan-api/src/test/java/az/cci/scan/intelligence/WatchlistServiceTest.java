package az.cci.scan.intelligence;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.WatchlistItem;
import az.cci.scan.importing.ImportService;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
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
import az.cci.scan.repository.ActivationRepository;
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
 * Proves a watched product's real current comparison is surfaced regardless of magnitude - unlike
 * the auto-detected movers feed, there is no support/magnitude floor here, because the team asked
 * to watch this specific product.
 */
@SpringBootTest
class WatchlistServiceTest {

    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String STORE_A = "STORE-A";
    private static final int PERIOD_DAYS = 14;

    @Autowired
    private ImportService importService;

    @Autowired
    private WatchlistService watchlistService;

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

        retailer = retailerRepository.save(new Retailer("WATCH", "Watchlist Test Shop", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(
            retailer, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
        receiptCounter = 0;
    }

    @Test
    void followingTheSameProductTwiceIsIdempotent() {
        WatchlistItem first = watchlistService.follow(retailer, "Sprite 500ml", "tester@example.com");
        WatchlistItem second = watchlistService.follow(retailer, "Sprite 500ml", "tester@example.com");

        assertThat(second.getId()).isEqualTo(first.getId());
        assertThat(watchlistService.list(retailer)).hasSize(1);
    }

    @Test
    void unfollowRemovesTheItemAndRejectsAnUnknownOne() {
        WatchlistItem item = watchlistService.follow(retailer, "Sprite 500ml", "tester@example.com");

        watchlistService.unfollow(retailer, item.getId());

        assertThat(watchlistService.list(retailer)).isEmpty();
        assertThatThrownBy(() -> watchlistService.unfollow(retailer, item.getId()))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void surfacesARealChangeForAWatchedProductEvenBelowTheMoversSupportFloor() {
        // Below MIN_SAMPLE_FOR_TREND (5) - biggestDecliners would never report this product, but a
        // watched product's real comparison is shown regardless, because it was asked for by name.
        importThinSpriteFixture();
        watchlistService.follow(retailer, "Sprite 500ml", "tester@example.com");

        List<ProductMover> changes = watchlistService.checkForChanges(retailer, PERIOD_DAYS);

        assertThat(changes).hasSize(1);
        assertThat(changes.get(0).productName()).isEqualTo("Sprite 500ml");
        assertThat(changes.get(0).priorBaskets()).isEqualTo(2);
        assertThat(changes.get(0).recentBaskets()).isEqualTo(1);
    }

    private void importThinSpriteFixture() {
        List<LocalDate> priorDates = datesAgo(16, 17);
        List<LocalDate> recentDates = datesAgo(1, 1);
        StringBuilder csv = new StringBuilder(header());
        for (LocalDate date : priorDates) {
            csv.append(spriteRow(STORE_A, date.atTime(12, 0)));
        }
        for (LocalDate date : recentDates) {
            csv.append(spriteRow(STORE_A, date.atTime(12, 0)));
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

    private void importCsv(String csv) {
        importService.importFile(retailer.getCode(), "CANONICAL", new MockMultipartFile(
            "file", "fixture.csv", "text/csv", csv.getBytes()
        ));
    }
}
