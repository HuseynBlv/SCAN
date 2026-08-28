package az.cci.scan.analytics;

import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.RetailerRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static az.cci.scan.analytics.AnalyticsQueryRepository.AnalyticsLineRow;
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

    @Transactional(readOnly = true)
    public OverviewResponse overview(String retailerCode, boolean cciUser) {
        Retailer retailer = retailerRepository.findByCodeIgnoreCase(retailerCode)
            .orElseThrow(() -> new IllegalArgumentException("Unknown retailer: " + retailerCode));
        if (cciUser && !retailer.isCciSharingEnabled()) {
            throw new AccessDeniedException("Retailer has not enabled CCI aggregate sharing");
        }

        List<AnalyticsLineRow> rows = analyticsQueryRepository.findByRetailerId(retailer.getId());
        OverviewResponse response = calculate(retailer, rows);
        return response.withInsights(insightRules.generate(response));
    }

    private OverviewResponse calculate(Retailer retailer, List<AnalyticsLineRow> rows) {
        Map<UUID, BasketAccumulator> basketsById = new LinkedHashMap<>();
        rows.forEach(row -> basketsById
            .computeIfAbsent(row.receiptId(), ignored -> new BasketAccumulator(row))
            .add(row));
        List<BasketAccumulator> baskets = new ArrayList<>(basketsById.values());

        long totalBaskets = baskets.size();
        long totalLines = rows.stream().filter(row -> row.lineId() != null).count();
        long mappedLines = rows.stream()
            .filter(row -> row.lineId() != null && row.canonicalProductId() != null)
            .count();
        List<BasketAccumulator> cciBasketsList = baskets.stream()
            .filter(BasketAccumulator::containsCci)
            .toList();
        long cciBaskets = cciBasketsList.size();
        Set<String> currencies = baskets.stream()
            .map(BasketAccumulator::currency)
            .collect(java.util.stream.Collectors.toSet());
        if (currencies.size() > 1) {
            throw new AnalyticsDataException(
                "Analytics cannot combine receipts with different currencies: "
                    + currencies.stream().sorted().collect(java.util.stream.Collectors.joining(", "))
            );
        }
        BigDecimal totalValue = baskets.stream()
            .map(BasketAccumulator::basketValue)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Long> companionCounts = new HashMap<>();
        Map<String, Long> categoryCounts = new HashMap<>();
        for (BasketAccumulator basket : cciBasketsList) {
            basket.companionProducts().forEach(product -> companionCounts.merge(product, 1L, Long::sum));
            basket.companionCategories().forEach(category -> categoryCounts.merge(category, 1L, Long::sum));
        }

        List<CompanionMetric> companions = companionCounts.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
            .limit(10)
            .map(entry -> new CompanionMetric(
                entry.getKey(),
                entry.getValue(),
                percentage(entry.getValue(), cciBaskets)
            ))
            .toList();
        List<CategoryMetric> categories = categoryCounts.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
            .limit(10)
            .map(entry -> new CategoryMetric(
                entry.getKey(),
                entry.getValue(),
                percentage(entry.getValue(), cciBaskets)
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
            percentage(mappedLines, totalLines),
            companions,
            categories,
            cciSkuMetrics(rows),
            dayparts,
            weekdayWeekend,
            storeMetrics(baskets),
            List.of()
        );
        return response;
    }

    private List<CciSkuMetric> cciSkuMetrics(List<AnalyticsLineRow> rows) {
        Map<UUID, SkuAccumulator> metrics = new HashMap<>();
        for (AnalyticsLineRow row : rows) {
            if (row.lineId() == null || row.canonicalProductId() == null || !row.cci()) {
                continue;
            }
            metrics.computeIfAbsent(
                row.canonicalProductId(),
                ignored -> new SkuAccumulator(row.normalizedName())
            ).add(row.receiptId(), row.quantity(), row.lineTotal());
        }
        return metrics.entrySet().stream()
            .map(entry -> new CciSkuMetric(
                entry.getKey(),
                entry.getValue().product,
                entry.getValue().receiptIds.size(),
                entry.getValue().quantity,
                entry.getValue().revenue
            ))
            .sorted(Comparator.comparing(CciSkuMetric::basketCount).reversed()
                .thenComparing(CciSkuMetric::product))
            .toList();
    }

    private List<StoreMetric> storeMetrics(List<BasketAccumulator> baskets) {
        Map<String, List<BasketAccumulator>> byStore = new LinkedHashMap<>();
        baskets.forEach(basket -> byStore
            .computeIfAbsent(basket.storeId(), ignored -> new ArrayList<>())
            .add(basket));
        return byStore.entrySet().stream().map(entry -> {
            List<BasketAccumulator> storeBaskets = entry.getValue();
            long cci = storeBaskets.stream().filter(BasketAccumulator::containsCci).count();
            BigDecimal value = storeBaskets.stream()
                .map(BasketAccumulator::basketValue)
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
        List<BasketAccumulator> baskets,
        java.util.function.Function<BasketAccumulator, String> classifier
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

    private static final class BasketAccumulator {
        private final Instant transactionTimestamp;
        private final String currency;
        private final BigDecimal basketValue;
        private final String storeId;
        private final Set<String> companionProducts = new HashSet<>();
        private final Set<String> companionCategories = new HashSet<>();
        private boolean containsCci;

        private BasketAccumulator(AnalyticsLineRow firstRow) {
            this.transactionTimestamp = firstRow.transactionTimestamp();
            this.currency = firstRow.currency();
            this.basketValue = firstRow.basketValue();
            this.storeId = firstRow.storeId();
        }

        private void add(AnalyticsLineRow row) {
            if (row.lineId() == null || row.canonicalProductId() == null) {
                return;
            }
            if (row.cci()) {
                containsCci = true;
                return;
            }
            companionProducts.add(row.normalizedName());
            if (row.category() != null && !row.category().isBlank()) {
                companionCategories.add(row.category());
            }
        }

        private Instant transactionTimestamp() {
            return transactionTimestamp;
        }

        private String currency() {
            return currency;
        }

        private BigDecimal basketValue() {
            return basketValue;
        }

        private String storeId() {
            return storeId;
        }

        private boolean containsCci() {
            return containsCci;
        }

        private Set<String> companionProducts() {
            return companionProducts;
        }

        private Set<String> companionCategories() {
            return companionCategories;
        }
    }

    private static final class SkuAccumulator {
        private final String product;
        private final Set<UUID> receiptIds = new HashSet<>();
        private BigDecimal quantity = BigDecimal.ZERO;
        private BigDecimal revenue = BigDecimal.ZERO;

        private SkuAccumulator(String product) {
            this.product = product;
        }

        private void add(UUID receiptId, BigDecimal nextQuantity, BigDecimal nextRevenue) {
            receiptIds.add(receiptId);
            quantity = quantity.add(nextQuantity);
            revenue = revenue.add(nextRevenue);
        }
    }
}
