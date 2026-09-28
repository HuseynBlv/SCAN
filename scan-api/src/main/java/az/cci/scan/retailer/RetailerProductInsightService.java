package az.cci.scan.retailer;

import az.cci.scan.domain.Retailer;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The shared basket-intelligence layer behind both retailer offers and actions: given a single
 * product, computes a real growth trend, time-of-day concentration, weekend uplift, and
 * basket-affinity with its most common companion product - all from that retailer's own
 * transaction lines, never fabricated. A signal is omitted (not guessed at) whenever there isn't
 * enough support behind it, the same "say nothing rather than guess" rule the rest of SCAN's
 * analytics already follows.
 */
@Service
class RetailerProductInsightService {

    private static final long MIN_BASKET_SUPPORT = 5;
    private static final int TREND_WINDOW_DAYS = 30;
    private static final BigDecimal MAX_EVENING_MULTIPLIER = BigDecimal.valueOf(5).setScale(2, RoundingMode.HALF_UP);

    private final RetailerAnalyticsQueryRepository queryRepository;

    RetailerProductInsightService(RetailerAnalyticsQueryRepository queryRepository) {
        this.queryRepository = queryRepository;
    }

    @Transactional(readOnly = true)
    Optional<ProductTrend> trend(Retailer retailer, String productName, Instant now) {
        Instant start = now.minus(2L * TREND_WINDOW_DAYS, ChronoUnit.DAYS);
        Instant recentStart = now.minus(TREND_WINDOW_DAYS, ChronoUnit.DAYS);
        List<RetailerAnalyticsQueryRepository.ProductBasketRow> rows =
            queryRepository.productBaskets(retailer.getId(), productName, start);
        if (rows.isEmpty()) return Optional.empty();

        ZoneId zoneId = ZoneId.of(retailer.getZoneId());
        List<RetailerAnalyticsQueryRepository.ProductBasketRow> recent = rows.stream()
            .filter(row -> !row.timestamp().isBefore(recentStart)).toList();
        List<RetailerAnalyticsQueryRepository.ProductBasketRow> prior = rows.stream()
            .filter(row -> row.timestamp().isBefore(recentStart)).toList();
        if (recent.size() < MIN_BASKET_SUPPORT) return Optional.empty();

        // Growth is measured in recorded units sold, not basket count - the same definition
        // RetailerActionService uses for its own trend comparisons, so the same product never
        // shows two different "growth" percentages depending on which SCAN page reports it.
        BigDecimal growthPercent = quantityGrowth(retailer, productName, recentStart, now);

        Map<String, Long> byDaypart = new LinkedHashMap<>();
        recent.forEach(row -> byDaypart.merge(daypart(row.timestamp().atZone(zoneId)), 1L, Long::sum));
        Map.Entry<String, Long> topDaypart = byDaypart.entrySet().stream()
            .max(Map.Entry.comparingByValue()).orElse(null);
        BigDecimal topDaypartSharePercent = topDaypart == null ? null : percentage(topDaypart.getValue(), recent.size());

        long friSunCount = recent.stream()
            .filter(row -> isFridayThroughSunday(row.timestamp().atZone(zoneId))).count();
        long monThuCount = recent.size() - friSunCount;
        BigDecimal weekendUpliftPercent = null;
        if (friSunCount >= MIN_BASKET_SUPPORT && monThuCount >= MIN_BASKET_SUPPORT) {
            BigDecimal friSunPerDay = BigDecimal.valueOf(friSunCount).divide(BigDecimal.valueOf(3), 4, RoundingMode.HALF_UP);
            BigDecimal monThuPerDay = BigDecimal.valueOf(monThuCount).divide(BigDecimal.valueOf(4), 4, RoundingMode.HALF_UP);
            if (monThuPerDay.signum() > 0) weekendUpliftPercent = percentChange(friSunPerDay, monThuPerDay);
        }

        return Optional.of(new ProductTrend(
            recent.size(), prior.size(), growthPercent,
            topDaypart == null ? null : topDaypart.getKey(), topDaypartSharePercent,
            weekendUpliftPercent
        ));
    }

    @Transactional(readOnly = true)
    Optional<CompanionAffinity> companionAffinity(Retailer retailer, String productName, Instant now) {
        Instant start = now.minus(TREND_WINDOW_DAYS, ChronoUnit.DAYS);
        Optional<RetailerAnalyticsQueryRepository.NamedCount> companion =
            queryRepository.topCompanion(retailer.getId(), productName, start);
        if (companion.isEmpty() || companion.get().basketCount() < MIN_BASKET_SUPPORT) return Optional.empty();
        String companionName = companion.get().name();

        List<RetailerAnalyticsQueryRepository.ProductBasketRow> productRows =
            queryRepository.productBaskets(retailer.getId(), productName, start);
        List<RetailerAnalyticsQueryRepository.ProductBasketRow> companionRows =
            queryRepository.productBaskets(retailer.getId(), companionName, start);
        Set<java.util.UUID> companionReceipts = companionRows.stream()
            .map(RetailerAnalyticsQueryRepository.ProductBasketRow::receiptId)
            .collect(Collectors.toSet());

        ZoneId zoneId = ZoneId.of(retailer.getZoneId());
        long eveningTotal = 0;
        long eveningBoth = 0;
        long restTotal = 0;
        long restBoth = 0;
        for (RetailerAnalyticsQueryRepository.ProductBasketRow row : productRows) {
            boolean evening = "EVENING".equals(daypart(row.timestamp().atZone(zoneId)));
            boolean hasCompanion = companionReceipts.contains(row.receiptId());
            if (evening) {
                eveningTotal++;
                if (hasCompanion) eveningBoth++;
            } else {
                restTotal++;
                if (hasCompanion) restBoth++;
            }
        }
        if (eveningTotal < MIN_BASKET_SUPPORT || restTotal < MIN_BASKET_SUPPORT) return Optional.empty();
        BigDecimal eveningShare = percentage(eveningBoth, eveningTotal);
        BigDecimal restShare = percentage(restBoth, restTotal);
        if (eveningShare.signum() <= 0) return Optional.empty();

        BigDecimal overallShare = percentage(eveningBoth + restBoth, eveningTotal + restTotal);
        // When the companion essentially never appears outside the evening, the ratio is
        // undefined rather than infinite - report it as a capped, conservative multiplier
        // instead of dividing by zero or rejecting what is actually the strongest possible signal.
        BigDecimal eveningMultiplier = restShare.signum() > 0
            ? eveningShare.divide(restShare, 2, RoundingMode.HALF_UP)
            : MAX_EVENING_MULTIPLIER;
        return Optional.of(new CompanionAffinity(companionName, overallShare, eveningMultiplier));
    }

    private BigDecimal quantityGrowth(Retailer retailer, String productName, Instant recentStart, Instant now) {
        Instant priorStart = recentStart.minus(TREND_WINDOW_DAYS, ChronoUnit.DAYS);
        BigDecimal recentQuantity = quantityFor(retailer, productName, recentStart, now);
        BigDecimal priorQuantity = quantityFor(retailer, productName, priorStart, recentStart);
        if (priorQuantity == null || priorQuantity.signum() <= 0 || recentQuantity == null) return null;
        return percentChange(recentQuantity, priorQuantity);
    }

    private BigDecimal quantityFor(Retailer retailer, String productName, Instant start, Instant end) {
        return queryRepository.productMetricsInRange(retailer.getId(), start, end).stream()
            .filter(product -> product.name().equals(productName))
            .map(RetailerAnalyticsDtos.ProductMetric::quantity)
            .findFirst()
            .orElse(null);
    }

    private BigDecimal percentChange(BigDecimal recent, BigDecimal prior) {
        return recent.subtract(prior).multiply(BigDecimal.valueOf(100)).divide(prior, 1, RoundingMode.HALF_UP);
    }

    private BigDecimal percentage(long numerator, long denominator) {
        if (denominator == 0) return BigDecimal.ZERO.setScale(1);
        return BigDecimal.valueOf(numerator).multiply(BigDecimal.valueOf(100))
            .divide(BigDecimal.valueOf(denominator), 1, RoundingMode.HALF_UP);
    }

    static String daypart(ZonedDateTime timestamp) {
        int hour = timestamp.getHour();
        if (hour < 6) return "NIGHT";
        if (hour < 11) return "MORNING";
        if (hour < 15) return "MIDDAY";
        if (hour < 18) return "AFTERNOON";
        if (hour < 22) return "EVENING";
        return "NIGHT";
    }

    static boolean isFridayThroughSunday(ZonedDateTime timestamp) {
        DayOfWeek day = timestamp.getDayOfWeek();
        return day == DayOfWeek.FRIDAY || day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY;
    }

    /**
     * @param topDaypart the daypart a plurality of the product's recent baskets fell into
     * @param weekendUpliftPercent Friday-through-Sunday average daily baskets vs Monday-through-Thursday, as a percent difference
     */
    record ProductTrend(
        long recentBasketCount,
        long priorBasketCount,
        BigDecimal growthPercent,
        String topDaypart,
        BigDecimal topDaypartSharePercent,
        BigDecimal weekendUpliftPercent
    ) {
    }

    record CompanionAffinity(
        String companionName,
        BigDecimal overallSharePercent,
        BigDecimal eveningMultiplier
    ) {
    }
}
