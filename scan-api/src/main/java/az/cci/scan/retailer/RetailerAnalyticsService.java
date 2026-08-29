package az.cci.scan.retailer;

import az.cci.scan.analytics.AnalyticsDataException;
import az.cci.scan.config.PilotAccessProperties;
import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.RetailerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

import static az.cci.scan.retailer.RetailerAnalyticsDtos.CategoryMetric;
import static az.cci.scan.retailer.RetailerAnalyticsDtos.DailyMetric;
import static az.cci.scan.retailer.RetailerAnalyticsDtos.Insight;
import static az.cci.scan.retailer.RetailerAnalyticsDtos.OverviewResponse;
import static az.cci.scan.retailer.RetailerAnalyticsDtos.Period;
import static az.cci.scan.retailer.RetailerAnalyticsDtos.ProductMetric;
import static az.cci.scan.retailer.RetailerAnalyticsDtos.SegmentMetric;
import static az.cci.scan.retailer.RetailerAnalyticsDtos.StoreMetric;
import static az.cci.scan.retailer.RetailerAnalyticsDtos.SyncStatus;

@Service
public class RetailerAnalyticsService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final RetailerRepository retailerRepository;
    private final ImportJobRepository importJobRepository;
    private final RetailerAnalyticsQueryRepository queryRepository;
    private final PilotAccessProperties pilotAccess;
    private final Clock clock;

    public RetailerAnalyticsService(
        RetailerRepository retailerRepository,
        ImportJobRepository importJobRepository,
        RetailerAnalyticsQueryRepository queryRepository,
        PilotAccessProperties pilotAccess,
        Clock clock
    ) {
        this.retailerRepository = retailerRepository;
        this.importJobRepository = importJobRepository;
        this.queryRepository = queryRepository;
        this.pilotAccess = pilotAccess;
        this.clock = clock;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public OverviewResponse overview(Period period) {
        Instant now = clock.instant();
        Retailer retailer = retailerRepository.findByCodeIgnoreCase(pilotAccess.retailerCode())
            .orElseThrow(() -> new IllegalArgumentException(
                "Unknown pilot retailer: " + pilotAccess.retailerCode()
            ));
        ZoneId zoneId = ZoneId.of(retailer.getZoneId());
        Instant startInclusive = start(period, now, zoneId);
        List<RetailerAnalyticsQueryRepository.BasketRow> baskets = queryRepository.findBaskets(
            retailer.getId(),
            startInclusive
        );
        RetailerAnalyticsQueryRepository.LineStats lineStats = queryRepository.lineStats(
            retailer.getId(),
            startInclusive
        );
        List<ProductMetric> topProducts = queryRepository.topProducts(retailer.getId(), startInclusive);
        List<CategoryMetric> topCategories = queryRepository.topCategories(retailer.getId(), startInclusive);

        long totalBaskets = baskets.size();
        long cciBaskets = baskets.stream().filter(RetailerAnalyticsQueryRepository.BasketRow::containsCci).count();
        BigDecimal totalSales = baskets.stream()
            .map(RetailerAnalyticsQueryRepository.BasketRow::basketValue)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        Set<String> currencies = baskets.stream()
            .map(RetailerAnalyticsQueryRepository.BasketRow::currency)
            .collect(Collectors.toSet());
        if (currencies.size() > 1) {
            throw new AnalyticsDataException(
                "Retailer analytics cannot combine different currencies: "
                    + currencies.stream().sorted().collect(Collectors.joining(", "))
            );
        }

        List<SegmentMetric> dayparts = segments(
            baskets,
            row -> daypart(row.timestamp().atZone(zoneId))
        );
        List<SegmentMetric> weekdayWeekend = segments(baskets, row -> {
            DayOfWeek day = row.timestamp().atZone(zoneId).getDayOfWeek();
            return day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY ? "WEEKEND" : "WEEKDAY";
        });
        SyncStatus sync = importJobRepository.findFirstByRetailerOrderByCreatedAtDesc(retailer)
            .map(SyncStatus::from)
            .orElseGet(SyncStatus::empty);

        return new OverviewResponse(
            now,
            period,
            period == Period.ALL_TIME ? null : startInclusive,
            retailer.getCode(),
            retailer.getName(),
            totalBaskets,
            totalSales,
            average(totalSales, totalBaskets),
            lineStats.totalQuantity(),
            average(lineStats.totalQuantity(), totalBaskets),
            cciBaskets,
            percentage(cciBaskets, totalBaskets),
            currencies.stream().findFirst().orElse("N/A"),
            percentage(lineStats.mappedLines(), lineStats.totalLines()),
            topProducts,
            topCategories,
            dayparts,
            weekdayWeekend,
            stores(baskets),
            dailySales(baskets, zoneId),
            insights(totalBaskets, cciBaskets, lineStats, topProducts, dayparts),
            sync
        );
    }

    private Instant start(Period period, Instant now, ZoneId zoneId) {
        if (period == Period.ALL_TIME) {
            return Instant.EPOCH;
        }
        LocalDate today = now.atZone(zoneId).toLocalDate();
        LocalDate firstDate = switch (period) {
            case TODAY -> today;
            case LAST_7_DAYS -> today.minusDays(6);
            case LAST_30_DAYS -> today.minusDays(29);
            case ALL_TIME -> throw new IllegalStateException("ALL_TIME handled above");
        };
        return firstDate.atStartOfDay(zoneId).toInstant();
    }

    private List<SegmentMetric> segments(
        List<RetailerAnalyticsQueryRepository.BasketRow> baskets,
        Function<RetailerAnalyticsQueryRepository.BasketRow, String> classifier
    ) {
        Map<String, Long> counts = new LinkedHashMap<>();
        baskets.forEach(basket -> counts.merge(classifier.apply(basket), 1L, Long::sum));
        return counts.entrySet().stream()
            .map(entry -> new SegmentMetric(
                entry.getKey(),
                entry.getValue(),
                percentage(entry.getValue(), baskets.size())
            ))
            .sorted(Comparator.comparing(SegmentMetric::basketCount).reversed()
                .thenComparing(SegmentMetric::segment))
            .toList();
    }

    private List<StoreMetric> stores(List<RetailerAnalyticsQueryRepository.BasketRow> baskets) {
        Map<String, List<RetailerAnalyticsQueryRepository.BasketRow>> byStore = baskets.stream()
            .collect(Collectors.groupingBy(
                RetailerAnalyticsQueryRepository.BasketRow::storeId,
                TreeMap::new,
                Collectors.toList()
            ));
        return byStore.entrySet().stream().map(entry -> {
            List<RetailerAnalyticsQueryRepository.BasketRow> storeBaskets = entry.getValue();
            BigDecimal sales = storeBaskets.stream()
                .map(RetailerAnalyticsQueryRepository.BasketRow::basketValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            return new StoreMetric(
                entry.getKey(),
                storeBaskets.size(),
                storeBaskets.stream().filter(RetailerAnalyticsQueryRepository.BasketRow::containsCci).count(),
                sales,
                average(sales, storeBaskets.size())
            );
        }).sorted(Comparator.comparing(StoreMetric::totalSales).reversed()
            .thenComparing(StoreMetric::storeId))
            .toList();
    }

    private List<DailyMetric> dailySales(
        List<RetailerAnalyticsQueryRepository.BasketRow> baskets,
        ZoneId zoneId
    ) {
        Map<LocalDate, List<RetailerAnalyticsQueryRepository.BasketRow>> byDate = baskets.stream()
            .collect(Collectors.groupingBy(
                row -> row.timestamp().atZone(zoneId).toLocalDate(),
                TreeMap::new,
                Collectors.toList()
            ));
        List<DailyMetric> all = byDate.entrySet().stream().map(entry -> new DailyMetric(
            entry.getKey(),
            entry.getValue().size(),
            entry.getValue().stream()
                .map(RetailerAnalyticsQueryRepository.BasketRow::basketValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
        )).toList();
        return all.size() <= 30 ? all : all.subList(all.size() - 30, all.size());
    }

    private List<Insight> insights(
        long totalBaskets,
        long cciBaskets,
        RetailerAnalyticsQueryRepository.LineStats lineStats,
        List<ProductMetric> products,
        List<SegmentMetric> dayparts
    ) {
        if (totalBaskets == 0) {
            return List.of(new Insight(
                "No complete baskets are available for this period.",
                "Sales patterns cannot be calculated until SCAN receives transaction exports.",
                "Check Data Sync or select a longer period."
            ));
        }
        List<Insight> insights = new ArrayList<>();
        if (!products.isEmpty()) {
            ProductMetric top = products.getFirst();
            insights.add(new Insight(
                top.name() + " generated " + top.revenue() + " in recorded sales.",
                "It is the highest-revenue product in the selected period.",
                "Keep it available and test placement with a complementary product."
            ));
        }
        if (!dayparts.isEmpty()) {
            SegmentMetric top = dayparts.getFirst();
            insights.add(new Insight(
                top.sharePercentage() + "% of baskets occurred during " + top.segment().toLowerCase() + ".",
                "This is the store's busiest part of the day in the selected period.",
                "Schedule replenishment and prominent displays before this period begins."
            ));
        }
        BigDecimal mapping = percentage(lineStats.mappedLines(), lineStats.totalLines());
        if (mapping.compareTo(BigDecimal.valueOf(90)) < 0) {
            insights.add(new Insight(
                mapping + "% of transaction lines have normalized product mappings.",
                "Unmapped products weaken category and product comparisons.",
                "Ask the SCAN administrator to review unresolved products."
            ));
        } else {
            insights.add(new Insight(
                percentage(cciBaskets, totalBaskets) + "% of baskets contained a CCI product.",
                "This is the observed CCI basket penetration for the selected period.",
                "Compare this rate over time after placement or promotion changes."
            ));
        }
        return List.copyOf(insights.stream().limit(3).toList());
    }

    private String daypart(ZonedDateTime timestamp) {
        int hour = timestamp.getHour();
        if (hour < 6) return "NIGHT";
        if (hour < 11) return "MORNING";
        if (hour < 15) return "MIDDAY";
        if (hour < 18) return "AFTERNOON";
        if (hour < 22) return "EVENING";
        return "NIGHT";
    }

    private BigDecimal percentage(long numerator, long denominator) {
        if (denominator == 0) {
            return BigDecimal.ZERO.setScale(1);
        }
        return BigDecimal.valueOf(numerator)
            .multiply(HUNDRED)
            .divide(BigDecimal.valueOf(denominator), 1, RoundingMode.HALF_UP);
    }

    private BigDecimal average(BigDecimal total, long count) {
        if (count == 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        return total.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
    }
}
