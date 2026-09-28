package az.cci.scan.retailer;

import az.cci.scan.domain.Retailer;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static az.cci.scan.retailer.RetailerEngagementDtos.Action;
import static az.cci.scan.retailer.RetailerEngagementDtos.ActionType;

/**
 * Turns a retailer's own recent transaction data into a short, honest list of recommended
 * actions - never more than one per category, and a category is skipped entirely rather than
 * padded with a weak or fabricated signal when the underlying data doesn't support it. This
 * mirrors the existing InsightRules philosophy elsewhere in SCAN: say nothing rather than guess.
 *
 * SCAN has no connected inventory system, so - unlike the illustrative product brief this was
 * built from - an action never claims to know units remaining on a shelf. It only ever states
 * what it can support from recorded sales: velocity, trend, and basket timing.
 */
@Service
public class RetailerActionService {

    private static final long MIN_BASKET_SUPPORT = 5;
    private static final BigDecimal ACCELERATION_THRESHOLD_PCT = BigDecimal.valueOf(15);
    private static final BigDecimal SLOWDOWN_THRESHOLD_PCT = BigDecimal.valueOf(-20);
    private static final BigDecimal PERFORMANCE_THRESHOLD_PCT = BigDecimal.valueOf(10);
    private static final BigDecimal DAYPART_CONCENTRATION_THRESHOLD_PCT = BigDecimal.valueOf(30);
    private static final int WINDOW_DAYS = 14;
    private static final int PERFORMANCE_WINDOW_DAYS = 30;

    private final RetailerAnalyticsQueryRepository queryRepository;
    private final Clock clock;

    public RetailerActionService(RetailerAnalyticsQueryRepository queryRepository, Clock clock) {
        this.queryRepository = queryRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Action> actions(Retailer retailer) {
        Instant now = clock.instant();
        Instant recentStart = now.minus(WINDOW_DAYS, ChronoUnit.DAYS);
        Instant priorStart = now.minus(2L * WINDOW_DAYS, ChronoUnit.DAYS);

        List<RetailerAnalyticsDtos.ProductMetric> recent =
            queryRepository.productMetricsInRange(retailer.getId(), recentStart, now);
        List<RetailerAnalyticsDtos.ProductMetric> prior =
            queryRepository.productMetricsInRange(retailer.getId(), priorStart, recentStart);
        Map<String, RetailerAnalyticsDtos.ProductMetric> priorByName = new LinkedHashMap<>();
        prior.forEach(product -> priorByName.put(product.name(), product));

        List<Action> actions = new ArrayList<>();
        urgent(recent, priorByName).ifPresent(actions::add);
        opportunity(retailer, now).ifPresent(actions::add);
        inventory(recent, priorByName).ifPresent(actions::add);
        performance(retailer, now).ifPresent(actions::add);
        return actions;
    }

    private Optional<Action> urgent(
        List<RetailerAnalyticsDtos.ProductMetric> recent,
        Map<String, RetailerAnalyticsDtos.ProductMetric> priorByName
    ) {
        return recent.stream()
            .filter(product -> product.basketCount() >= MIN_BASKET_SUPPORT)
            .map(product -> growth(product, priorByName.get(product.name())))
            .filter(growth -> growth != null && growth.percent().compareTo(ACCELERATION_THRESHOLD_PCT) >= 0)
            .max(Comparator.comparing(Growth::percent))
            .map(growth -> {
                RetailerAnalyticsDtos.ProductMetric product = growth.product();
                BigDecimal velocity = product.quantity().divide(BigDecimal.valueOf(WINDOW_DAYS), 1, RoundingMode.HALF_UP);
                return new Action(
                    "urgent-" + slug(product.name()),
                    ActionType.URGENT,
                    product.name() + " demand is accelerating",
                    product.name() + " demand is up " + growth.percent().setScale(0, RoundingMode.HALF_UP)
                        + "% over the last " + WINDOW_DAYS + " days, with " + product.quantity().stripTrailingZeros().toPlainString()
                        + " units sold.",
                    "Consider checking shelf stock and adding to your next order.",
                    "Sales velocity (last " + WINDOW_DAYS + " days)",
                    velocity + " units/day"
                );
            });
    }

    private Optional<Action> inventory(
        List<RetailerAnalyticsDtos.ProductMetric> recent,
        Map<String, RetailerAnalyticsDtos.ProductMetric> priorByName
    ) {
        return recent.stream()
            .map(product -> growth(product, priorByName.get(product.name())))
            .filter(growth -> growth != null
                && growth.priorBasketCount() >= MIN_BASKET_SUPPORT
                && growth.percent().compareTo(SLOWDOWN_THRESHOLD_PCT) <= 0)
            .min(Comparator.comparing(Growth::percent))
            .map(growth -> {
                RetailerAnalyticsDtos.ProductMetric product = growth.product();
                return new Action(
                    "inventory-" + slug(product.name()),
                    ActionType.INVENTORY,
                    product.name() + " is moving slower than usual",
                    "Sales are " + growth.percent().abs().setScale(0, RoundingMode.HALF_UP)
                        + "% below the prior " + WINDOW_DAYS + "-day period.",
                    "Consider reducing the next order.",
                    "Change vs prior " + WINDOW_DAYS + " days",
                    growth.percent().setScale(0, RoundingMode.HALF_UP) + "%"
                );
            });
    }

    private Optional<Action> opportunity(Retailer retailer, Instant now) {
        List<RetailerAnalyticsDtos.ProductMetric> topCci = queryRepository.topCciProducts(
            retailer.getId(), now.minus(PERFORMANCE_WINDOW_DAYS, ChronoUnit.DAYS), 1
        );
        if (topCci.isEmpty()) return Optional.empty();
        String topProduct = topCci.getFirst().name();

        List<RetailerAnalyticsQueryRepository.BasketRow> baskets = queryRepository.findBaskets(
            retailer.getId(), now.minus(PERFORMANCE_WINDOW_DAYS, ChronoUnit.DAYS)
        );
        if (baskets.size() < MIN_BASKET_SUPPORT) return Optional.empty();

        ZoneId zoneId = ZoneId.of(retailer.getZoneId());
        Map<String, Long> byDaypart = new LinkedHashMap<>();
        baskets.forEach(basket -> byDaypart.merge(daypart(basket.timestamp().atZone(zoneId)), 1L, Long::sum));
        Map.Entry<String, Long> top = byDaypart.entrySet().stream()
            .max(Map.Entry.comparingByValue())
            .orElseThrow();
        BigDecimal sharePercentage = BigDecimal.valueOf(top.getValue())
            .multiply(BigDecimal.valueOf(100))
            .divide(BigDecimal.valueOf(baskets.size()), 1, RoundingMode.HALF_UP);
        if (sharePercentage.compareTo(DAYPART_CONCENTRATION_THRESHOLD_PCT) < 0) return Optional.empty();

        String segment = top.getKey().toLowerCase();
        return Optional.of(new Action(
            "opportunity-" + slug(topProduct),
            ActionType.OPPORTUNITY,
            topProduct + " sells most during " + segment,
            sharePercentage + "% of your last " + PERFORMANCE_WINDOW_DAYS + " days' baskets occurred during "
                + segment + ", where " + topProduct + " is your top CCI seller.",
            "Consider placing " + topProduct + " near complementary items during " + segment + " hours.",
            "Basket share during " + segment,
            sharePercentage + "%"
        ));
    }

    private Optional<Action> performance(Retailer retailer, Instant now) {
        Instant recentStart = now.minus(PERFORMANCE_WINDOW_DAYS, ChronoUnit.DAYS);
        Instant priorStart = now.minus(2L * PERFORMANCE_WINDOW_DAYS, ChronoUnit.DAYS);
        BigDecimal recentRevenue = queryRepository.cciRevenueInRange(retailer.getId(), recentStart, now);
        BigDecimal priorRevenue = queryRepository.cciRevenueInRange(retailer.getId(), priorStart, recentStart);
        if (priorRevenue.signum() <= 0) return Optional.empty();

        BigDecimal growthPct = recentRevenue.subtract(priorRevenue)
            .multiply(BigDecimal.valueOf(100))
            .divide(priorRevenue, 1, RoundingMode.HALF_UP);
        if (growthPct.compareTo(PERFORMANCE_THRESHOLD_PCT) < 0) return Optional.empty();

        return Optional.of(new Action(
            "performance-cci",
            ActionType.PERFORMANCE,
            "Your CCI product sales are performing strongly",
            "CCI product sales are ₼" + recentRevenue.setScale(2, RoundingMode.HALF_UP) + " in the last "
                + PERFORMANCE_WINDOW_DAYS + " days, " + growthPct + "% higher than the prior "
                + PERFORMANCE_WINDOW_DAYS + " days.",
            "Keep current placement and stock levels for your CCI range.",
            "CCI sales change (vs prior " + PERFORMANCE_WINDOW_DAYS + " days)",
            "+" + growthPct + "%"
        ));
    }

    private Growth growth(
        RetailerAnalyticsDtos.ProductMetric recentProduct,
        RetailerAnalyticsDtos.ProductMetric priorProduct
    ) {
        if (priorProduct == null || priorProduct.quantity() == null || priorProduct.quantity().signum() <= 0) return null;
        if (recentProduct.quantity() == null) return null;
        BigDecimal percent = recentProduct.quantity().subtract(priorProduct.quantity())
            .multiply(BigDecimal.valueOf(100))
            .divide(priorProduct.quantity(), 1, RoundingMode.HALF_UP);
        return new Growth(recentProduct, percent, priorProduct.basketCount());
    }

    private record Growth(RetailerAnalyticsDtos.ProductMetric product, BigDecimal percent, long priorBasketCount) {
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

    private String slug(String value) {
        return value.toUpperCase(java.util.Locale.ROOT).replaceAll("[^A-Z0-9]+", "-").replaceAll("^-|-$", "");
    }
}
