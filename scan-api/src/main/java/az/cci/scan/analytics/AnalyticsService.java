package az.cci.scan.analytics;

import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.RetailerRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static az.cci.scan.analytics.AnalyticsQueryRepository.AnalyticsBasketRow;
import static az.cci.scan.analytics.AnalyticsQueryRepository.AnalyticsCciSkuRow;
import static az.cci.scan.analytics.AnalyticsQueryRepository.AnalyticsLineStats;
import static az.cci.scan.analytics.AnalyticsQueryRepository.NamedBasketCount;
import static az.cci.scan.analytics.AnalyticsDtos.CategoryMetric;
import static az.cci.scan.analytics.AnalyticsDtos.CciSkuMetric;
import static az.cci.scan.analytics.AnalyticsDtos.CompanionMetric;
import static az.cci.scan.analytics.AnalyticsDtos.OverviewResponse;
import static az.cci.scan.analytics.AnalyticsDtos.SegmentMetric;
import static az.cci.scan.analytics.AnalyticsDtos.StoreMetric;

@Service
public class AnalyticsService {

    private final RetailerRepository retailerRepository;
    private final AnalyticsQueryRepository analyticsQueryRepository;
    private final InsightRules insightRules;

    public AnalyticsService(
        RetailerRepository retailerRepository,
        AnalyticsQueryRepository analyticsQueryRepository,
        InsightRules insightRules
    ) {
        this.retailerRepository = retailerRepository;
        this.analyticsQueryRepository = analyticsQueryRepository;
        this.insightRules = insightRules;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public OverviewResponse overview(String retailerCode, boolean cciUser) {
        Retailer retailer = retailerRepository.findByCodeIgnoreCase(retailerCode)
            .orElseThrow(() -> new IllegalArgumentException("Unknown retailer: " + retailerCode));
        if (cciUser && !retailer.isCciSharingEnabled()) {
            throw new AccessDeniedException("Retailer has not enabled CCI aggregate sharing");
        }

        List<AnalyticsBasketRow> baskets = analyticsQueryRepository
            .findBasketsByRetailerId(retailer.getId());
        AnalyticsLineStats lineStats = analyticsQueryRepository.lineStats(retailer.getId());
        OverviewResponse response = calculate(
            retailer,
            baskets,
            lineStats,
            analyticsQueryRepository.findCompanionProducts(retailer.getId()),
            analyticsQueryRepository.findCompanionCategories(retailer.getId()),
            analyticsQueryRepository.findCciSkus(retailer.getId())
        );
        return response.withInsights(insightRules.generate(response));
    }

    private OverviewResponse calculate(
        Retailer retailer,
        List<AnalyticsBasketRow> baskets,
        AnalyticsLineStats lineStats,
        List<NamedBasketCount> companionProductCounts,
        List<NamedBasketCount> companionCategoryCounts,
        List<AnalyticsCciSkuRow> cciSkuRows
    ) {
        long totalBaskets = baskets.size();
        long cciBaskets = baskets.stream().filter(AnalyticsBasketRow::containsCci).count();
        Set<String> currencies = baskets.stream()
            .map(AnalyticsBasketRow::currency)
            .collect(java.util.stream.Collectors.toSet());
        if (currencies.size() > 1) {
            throw new AnalyticsDataException(
                "Analytics cannot combine receipts with different currencies: "
                    + currencies.stream().sorted().collect(java.util.stream.Collectors.joining(", "))
            );
        }
        BigDecimal totalValue = baskets.stream()
            .map(AnalyticsBasketRow::basketValue)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<CompanionMetric> companions = companionProductCounts.stream()
            .map(item -> new CompanionMetric(
                item.label(),
                item.basketCount(),
                percentage(item.basketCount(), cciBaskets)
            ))
            .toList();
        List<CategoryMetric> categories = companionCategoryCounts.stream()
            .map(item -> new CategoryMetric(
                item.label(),
                item.basketCount(),
                percentage(item.basketCount(), cciBaskets)
            ))
            .toList();

        ZoneId zoneId = ZoneId.of(retailer.getZoneId());
        List<SegmentMetric> dayparts = segmentMetrics(baskets, basket -> daypart(
            basket.transactionTimestamp().atZone(zoneId)
        ));
        List<SegmentMetric> weekdayWeekend = segmentMetrics(baskets, basket -> {
            DayOfWeek day = basket.transactionTimestamp().atZone(zoneId).getDayOfWeek();
            return day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY
                ? "WEEKEND"
                : "WEEKDAY";
        });

        OverviewResponse response = new OverviewResponse(
            Instant.now(),
            retailer.getCode(),
            retailer.getName(),
            totalBaskets,
            cciBaskets,
            percentage(cciBaskets, totalBaskets),
            average(totalValue, totalBaskets),
            currency(currencies),
            percentage(lineStats.mappedLines(), lineStats.totalLines()),
            companions,
            categories,
            cciSkuMetrics(cciSkuRows),
            dayparts,
            weekdayWeekend,
            storeMetrics(baskets),
            List.of()
        );
        return response;
    }

    private List<CciSkuMetric> cciSkuMetrics(List<AnalyticsCciSkuRow> rows) {
        return rows.stream()
            .map(row -> new CciSkuMetric(
                row.productId(),
                row.product(),
                row.basketCount(),
                row.quantity(),
                row.revenue()
            ))
            .toList();
    }

    private List<StoreMetric> storeMetrics(List<AnalyticsBasketRow> baskets) {
        Map<String, List<AnalyticsBasketRow>> byStore = new LinkedHashMap<>();
        baskets.forEach(basket -> byStore
            .computeIfAbsent(basket.storeId(), ignored -> new ArrayList<>())
            .add(basket));
        return byStore.entrySet().stream().map(entry -> {
            List<AnalyticsBasketRow> storeBaskets = entry.getValue();
            long cci = storeBaskets.stream().filter(AnalyticsBasketRow::containsCci).count();
            BigDecimal value = storeBaskets.stream()
                .map(AnalyticsBasketRow::basketValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            return new StoreMetric(
                entry.getKey(),
                storeBaskets.size(),
                cci,
                percentage(cci, storeBaskets.size()),
                average(value, storeBaskets.size())
            );
        }).sorted(Comparator.comparing(StoreMetric::basketCount).reversed()
            .thenComparing(StoreMetric::storeId)).toList();
    }

    private List<SegmentMetric> segmentMetrics(
        List<AnalyticsBasketRow> baskets,
        java.util.function.Function<AnalyticsBasketRow, String> classifier
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

    private String daypart(ZonedDateTime timestamp) {
        int hour = timestamp.getHour();
        if (hour >= 6 && hour < 11) {
            return "MORNING";
        }
        if (hour >= 11 && hour < 15) {
            return "MIDDAY";
        }
        if (hour >= 15 && hour < 18) {
            return "AFTERNOON";
        }
        if (hour >= 18 && hour < 22) {
            return "EVENING";
        }
        return "NIGHT";
    }

    private String currency(Set<String> currencies) {
        if (currencies.isEmpty()) {
            return "N/A";
        }
        return currencies.iterator().next();
    }

    private BigDecimal percentage(long numerator, long denominator) {
        if (denominator == 0) {
            return BigDecimal.ZERO.setScale(1);
        }
        return BigDecimal.valueOf(numerator)
            .multiply(BigDecimal.valueOf(100))
            .divide(BigDecimal.valueOf(denominator), 1, RoundingMode.HALF_UP);
    }

    private BigDecimal average(BigDecimal total, long count) {
        if (count == 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        return total.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
    }

}
