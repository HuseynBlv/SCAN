package az.cci.scan.retailer;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.importing.ImportService;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportPreviewRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerOfferActivationRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.FieldTaskRepository;
import az.cci.scan.repository.InvestigationRepository;
import az.cci.scan.repository.WatchlistItemRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.ScanAccountRepository;
import az.cci.scan.repository.StoreRepository;
import az.cci.scan.repository.OperationalAuditEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Direct coverage of the basket-intelligence signals that drive offer diversity and richer
 * actions: real growth, real time-of-day concentration, real weekend uplift, and real
 * companion-product affinity. Each fixture is built from genuine calendar dates (not fixed
 * strings), so the test is not tied to whatever day it happens to run on.
 */
@SpringBootTest
class RetailerProductInsightServiceTest {

    @Autowired
    private ImportService importService;

    @Autowired
    private RetailerProductInsightService insightService;

    @Autowired
    private FieldTaskRepository fieldTaskRepository;

    @Autowired
    private InvestigationRepository investigationRepository;

    @Autowired
    private WatchlistItemRepository watchlistItemRepository;

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

    @Autowired
    private RetailerOfferActivationRepository activationRepository;

    @Autowired
    private ScanAccountRepository accountRepository;

    @Autowired
    private OperationalAuditEventRepository auditEventRepository;

    private Retailer retailer;
    private Instant now;
    private int receiptCounter;

    @BeforeEach
    void setUp() {
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
        fieldTaskRepository.deleteAll();
        watchlistItemRepository.deleteAll();
        investigationRepository.deleteAll();
        retailerRepository.deleteAll();

        saveCanonical("Fanta Orange 500ml", "5000112611397", "Beverages", true);
        saveCanonical("Sprite 500ml", "5449000015101", "Beverages", true);
        saveCanonical("Coca-Cola Original 500ml", "5449000000996", "Beverages", true);
        saveCanonical("Lay's Classic 150g", "5053990109332", "Snacks", false);

        retailer = retailerRepository.save(new Retailer("BASKET", "Basket Intelligence Test Shop", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(
            retailer, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
        now = Instant.now();
        receiptCounter = 0;
    }

    @Test
    void findsRealTimeOfDayConcentration() {
        // Every Fanta receipt lands at 16:00 - squarely in the AFTERNOON band - so the dominant
        // daypart is not a coincidence of dataset size, it is the whole dataset.
        List<LocalDate> dates = recentDates(day -> true, 6);
        importRows(dates.stream()
            .map(date -> row("FANTA", "5000112611397", "Fanta Orange 500ml", date.atTime(16, 0), 1, "3.00"))
            .toList());

        Optional<RetailerProductInsightService.ProductTrend> trend =
            insightService.trend(retailer, "Fanta Orange 500ml", now);

        assertThat(trend).isPresent();
        assertThat(trend.get().topDaypart()).isEqualTo("AFTERNOON");
        assertThat(trend.get().topDaypartSharePercent()).isEqualByComparingTo(BigDecimal.valueOf(100.0).setScale(1));
    }

    @Test
    void findsRealWeekendUplift() {
        // Two Sprite receipts on each of six Friday/Saturday/Sunday dates, one on each of six
        // Monday-Thursday dates - a genuine, real difference in average daily baskets, not a
        // fabricated percentage.
        List<LocalDate> weekendDates = recentDates(
            day -> day == DayOfWeek.FRIDAY || day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY, 6
        );
        List<LocalDate> weekdayDates = recentDates(
            day -> day == DayOfWeek.MONDAY || day == DayOfWeek.TUESDAY || day == DayOfWeek.WEDNESDAY || day == DayOfWeek.THURSDAY, 6
        );
        List<String> rows = new ArrayList<>();
        weekendDates.forEach(date -> {
            rows.add(row("SPRITE", "5449000015101", "Sprite 500ml", date.atTime(12, 0), 1, "2.50"));
            rows.add(row("SPRITE", "5449000015101", "Sprite 500ml", date.atTime(19, 0), 1, "2.50"));
        });
        weekdayDates.forEach(date -> rows.add(row("SPRITE", "5449000015101", "Sprite 500ml", date.atTime(12, 0), 1, "2.50")));
        importRows(rows);

        Optional<RetailerProductInsightService.ProductTrend> trend =
            insightService.trend(retailer, "Sprite 500ml", now);

        assertThat(trend).isPresent();
        assertThat(trend.get().weekendUpliftPercent()).isNotNull();
        assertThat(trend.get().weekendUpliftPercent().signum()).isPositive();
    }

    @Test
    void findsARealCompanionProductWithAGenuineEveningMultiplier() {
        // Coca-Cola + Lay's appear together only in the evening; Coca-Cola alone (no Lay's) fills
        // out the rest of the day, so the multiplier reflects a real, constructed difference.
        List<LocalDate> dates = recentDates(day -> true, 8);
        List<String> rows = new ArrayList<>();
        for (LocalDate date : dates) {
            rows.add(twoLineRow(date.atTime(19, 0),
                "COKE", "5449000000996", "Coca-Cola Original 500ml", "1.50",
                "LAYS", "5053990109332", "Lay's Classic 150g", "2.00"));
            rows.add(row("COKE", "5449000000996", "Coca-Cola Original 500ml", date.atTime(10, 0), 1, "1.50"));
        }
        importRows(rows);

        Optional<RetailerProductInsightService.CompanionAffinity> affinity =
            insightService.companionAffinity(retailer, "Coca-Cola Original 500ml", now);

        assertThat(affinity).isPresent();
        assertThat(affinity.get().companionName()).isEqualTo("Lay's Classic 150g");
        assertThat(affinity.get().eveningMultiplier()).isGreaterThan(BigDecimal.ONE);
    }

    @Test
    void growthIsMeasuredInUnitsSoldNotBasketCount() {
        // Same basket count in both windows (10 recent, 10 prior) but double the quantity per
        // basket recently. A basket-count-based growth calculation would report 0% here; the
        // real, intended answer - the same definition RetailerActionService uses - is +100%.
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        List<String> rows = new ArrayList<>();
        for (int day = 1; day <= 10; day++) {
            rows.add(row("FANTA", "5000112611397", "Fanta Orange 500ml", today.minusDays(day).atTime(12, 0), 2, "3.00"));
        }
        for (int day = 35; day <= 44; day++) {
            rows.add(row("FANTA", "5000112611397", "Fanta Orange 500ml", today.minusDays(day).atTime(12, 0), 1, "3.00"));
        }
        importRows(rows);

        Optional<RetailerProductInsightService.ProductTrend> trend =
            insightService.trend(retailer, "Fanta Orange 500ml", now);

        assertThat(trend).isPresent();
        assertThat(trend.get().growthPercent()).isEqualByComparingTo(BigDecimal.valueOf(100.0).setScale(1));
    }

    @Test
    void omitsASignalRatherThanGuessingWhenSupportIsThin() {
        // Two receipts is well under the five-basket support floor - no daypart, no weekend
        // uplift, no companion should be reported from this alone.
        List<LocalDate> dates = recentDates(day -> true, 2);
        importRows(dates.stream()
            .map(date -> row("FANTA", "5000112611397", "Fanta Orange 500ml", date.atTime(16, 0), 1, "3.00"))
            .toList());

        assertThat(insightService.trend(retailer, "Fanta Orange 500ml", now)).isEmpty();
        assertThat(insightService.companionAffinity(retailer, "Fanta Orange 500ml", now)).isEmpty();
    }

    private List<LocalDate> recentDates(Predicate<DayOfWeek> predicate, int count) {
        List<LocalDate> dates = new ArrayList<>();
        LocalDate cursor = LocalDate.now(ZoneOffset.UTC).minusDays(1);
        while (dates.size() < count) {
            if (predicate.test(cursor.getDayOfWeek())) dates.add(cursor);
            cursor = cursor.minusDays(1);
        }
        return dates;
    }

    // LocalDateTime.toString() omits a zero seconds field, but the synthetic-canonical-v1
    // profile's timestamp pattern (yyyy-MM-dd'T'HH:mm:ss) requires it - always format explicitly.
    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private String row(String productCode, String barcode, String productName, LocalDateTime timestamp, int quantity, String unitPrice) {
        receiptCounter++;
        BigDecimal lineTotal = new BigDecimal(unitPrice).multiply(BigDecimal.valueOf(quantity));
        return "STORE-01,R-" + receiptCounter + "," + TIMESTAMP_FORMAT.format(timestamp) + "," + productCode + "," + barcode + "," + productName
            + "," + quantity + "," + unitPrice + ",0.00," + lineTotal + "\n";
    }

    private String twoLineRow(
        LocalDateTime timestamp,
        String productCodeA, String barcodeA, String nameA, String priceA,
        String productCodeB, String barcodeB, String nameB, String priceB
    ) {
        receiptCounter++;
        String receiptId = "R-" + receiptCounter;
        String formatted = TIMESTAMP_FORMAT.format(timestamp);
        return "STORE-01," + receiptId + "," + formatted + "," + productCodeA + "," + barcodeA + "," + nameA + ",1," + priceA + ",0.00," + priceA + "\n"
            + "STORE-01," + receiptId + "," + formatted + "," + productCodeB + "," + barcodeB + "," + nameB + ",1," + priceB + ",0.00," + priceB + "\n";
    }

    private void importRows(List<String> rows) {
        StringBuilder csv = new StringBuilder(
            "store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total\n"
        );
        rows.forEach(csv::append);
        importService.importFile(retailer.getCode(), "CANONICAL", new MockMultipartFile(
            "file", "fixture.csv", "text/csv", csv.toString().getBytes()
        ));
    }

    private void saveCanonical(String name, String barcode, String category, boolean cci) {
        canonicalProductRepository.save(new CanonicalProduct(
            name, barcode, cci ? "CCI" : "Synthetic", cci ? "CCI" : "Synthetic", category, null, null, null, cci
        ));
    }
}
