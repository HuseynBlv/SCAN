package az.cci.scan.retailer;

import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.CanonicalProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static az.cci.scan.retailer.RetailerEngagementDtos.Action;
import static az.cci.scan.retailer.RetailerEngagementDtos.ActionScope;
import static az.cci.scan.retailer.RetailerEngagementDtos.ActionType;

/**
 * Turns a retailer's own recent transaction data into a short, honest list of recommended
 * actions - never more than one per category, and a category is skipped entirely rather than
 * padded with a weak or fabricated signal when the underlying data doesn't support it. This
 * mirrors the existing InsightRules philosophy elsewhere in SCAN: say nothing rather than guess.
 *
 * Each action is also labeled with a scope - CCI (a Coca-Cola System product) or STORE (anything
 * else) - so the retailer sees that SCAN helps with the whole store, not only Coca-Cola products.
 *
 * SCAN has no connected inventory system, so - unlike the illustrative product brief this was
 * built from - an action never claims to know units remaining on a shelf or predicts a specific
 * stock-out date. It only ever states what it can support from recorded sales: velocity, trend,
 * and basket timing.
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
    private final RetailerProductInsightService insightService;
    private final CanonicalProductRepository canonicalProductRepository;
    private final Clock clock;

    public RetailerActionService(
        RetailerAnalyticsQueryRepository queryRepository,
        RetailerProductInsightService insightService,
        CanonicalProductRepository canonicalProductRepository,
        Clock clock
    ) {
        this.queryRepository = queryRepository;
        this.insightService = insightService;
        this.canonicalProductRepository = canonicalProductRepository;
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
        Set<String> cciNames = canonicalProductRepository.findAllByCciTrue().stream()
            .map(product -> product.getNormalizedName())
            .collect(Collectors.toSet());

        List<Action> actions = new ArrayList<>();
        stockRisk(recent, priorByName, cciNames).ifPresent(actions::add);
        opportunity(retailer, now).ifPresent(actions::add);
        inventory(recent, priorByName, cciNames).ifPresent(actions::add);
        performance(retailer, now).ifPresent(actions::add);
        return actions;
    }

    private Optional<Action> stockRisk(
        List<RetailerAnalyticsDtos.ProductMetric> recent,
        Map<String, RetailerAnalyticsDtos.ProductMetric> priorByName,
        Set<String> cciNames
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
                    "stock-risk-" + slug(product.name()),
                    ActionType.STOCK_RISK,
                    scope(product.name(), cciNames),
                    product.name() + " is selling " + growth.percent().setScale(0, RoundingMode.HALF_UP) + "% faster than usual",
                    product.name() + " demand is up " + growth.percent().setScale(0, RoundingMode.HALF_UP)
                        + "% over the last " + WINDOW_DAYS + " days, with " + product.quantity().stripTrailingZeros().toPlainString()
                        + " units sold.",
                    "Consider adding stock to your next order and checking shelf availability.",
                    "Sales velocity (last " + WINDOW_DAYS + " days)",
                    velocity + " units/day"
                );
            });
    }

    private Optional<Action> inventory(
        List<RetailerAnalyticsDtos.ProductMetric> recent,
        Map<String, RetailerAnalyticsDtos.ProductMetric> priorByName,
        Set<String> cciNames
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
                    scope(product.name(), cciNames),
                    product.name() + " sales are down " + growth.percent().abs().setScale(0, RoundingMode.HALF_UP)
                        + "% vs the previous " + WINDOW_DAYS + "-day period",
                    "Sales are " + growth.percent().abs().setScale(0, RoundingMode.HALF_UP)
                        + "% below the prior " + WINDOW_DAYS + "-day period.",
                    "Consider reducing the next order until demand recovers.",
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

        Optional<RetailerProductInsightService.CompanionAffinity> affinity =
            insightService.companionAffinity(retailer, topProduct, now);
        if (affinity.isPresent()) {
            RetailerProductInsightService.CompanionAffinity companion = affinity.get();
            return Optional.of(new Action(
                "opportunity-" + slug(topProduct),
                ActionType.OPPORTUNITY,
                ActionScope.CCI,
                topProduct + " + " + companion.companionName() + " basket affinity",
                topProduct + " and " + companion.companionName() + " appear together in "
                    + companion.overallSharePercent() + "% of " + topProduct + "'s baskets. This pairing is "
                    + companion.eveningMultiplier() + "x more common between 18:00-22:00 than during the rest of the day.",
                "Consider placing " + topProduct + " closer to " + companion.companionName() + " after 17:00.",
                "Evening basket-affinity multiplier",
                companion.eveningMultiplier() + "x"
            ));
        }

        // No strong companion product yet - fall back to when this product itself sells best,
        // still a real, grounded signal rather than an invented one.
        List<RetailerAnalyticsQueryRepository.BasketRow> baskets = queryRepository.findBaskets(
            retailer.getId(), now.minus(PERFORMANCE_WINDOW_DAYS, ChronoUnit.DAYS)
        );
        if (baskets.size() < MIN_BASKET_SUPPORT) return Optional.empty();
        Map<String, Long> byDaypart = new LinkedHashMap<>();
        baskets.forEach(basket -> byDaypart.merge(
            RetailerProductInsightService.daypart(basket.timestamp().atZone(java.time.ZoneId.of(retailer.getZoneId()))),
            1L, Long::sum
        ));
        Map.Entry<String, Long> top = byDaypart.entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow();
        BigDecimal sharePercentage = BigDecimal.valueOf(top.getValue())
            .multiply(BigDecimal.valueOf(100))
            .divide(BigDecimal.valueOf(baskets.size()), 1, RoundingMode.HALF_UP);
        if (sharePercentage.compareTo(DAYPART_CONCENTRATION_THRESHOLD_PCT) < 0) return Optional.empty();

        String segment = top.getKey().toLowerCase(Locale.ROOT);
        return Optional.of(new Action(
            "opportunity-" + slug(topProduct),
            ActionType.OPPORTUNITY,
            ActionScope.CCI,
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
            ActionScope.CCI,
            "Your CCI product sales are performing strongly",
            "CCI product sales are ₼" + recentRevenue.setScale(2, RoundingMode.HALF_UP) + " in the last "
                + PERFORMANCE_WINDOW_DAYS + " days, " + growthPct + "% higher than the prior "
                + PERFORMANCE_WINDOW_DAYS + " days.",
            "Keep current placement and stock levels for your CCI range.",
            "CCI sales change (vs prior " + PERFORMANCE_WINDOW_DAYS + " days)",
            "+" + growthPct + "%"
        ));
    }

    private ActionScope scope(String productName, Set<String> cciNames) {
        return cciNames.contains(productName) ? ActionScope.CCI : ActionScope.STORE;
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

    private String slug(String value) {
        return value.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "-").replaceAll("^-|-$", "");
    }
}
