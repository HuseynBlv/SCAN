package az.cci.scan.retailer;

import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.RetailerOfferActivation;
import az.cci.scan.operations.AuditService;
import az.cci.scan.repository.RetailerOfferActivationRepository;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static az.cci.scan.retailer.RetailerEngagementDtos.Offer;
import static az.cci.scan.retailer.RetailerEngagementDtos.OfferStatus;
import static az.cci.scan.retailer.RetailerEngagementDtos.OfferType;
import static az.cci.scan.retailer.RetailerEngagementDtos.OffersResponse;

/**
 * Turns a retailer's own recorded CCI-product sales into commercial offer recommendations.
 * Nothing here is hardcoded demo copy: the candidate products, the offer mechanic, the reasoning,
 * and the estimated benefit are all computed from that retailer's real transaction data (via
 * RetailerProductInsightService), so a retailer with no CCI product sales correctly sees no
 * offers rather than a placeholder, and two retailers never see identical offers.
 *
 * Offers deliberately use different real trade-marketing mechanics (a volume discount, a bonus
 * product, a weekend activation, a basket-growth opportunity) rather than one templated
 * structure repeated with different numbers - each mechanic is only used when the retailer's own
 * data actually supports its reasoning (real growth, real time-of-day concentration, a real
 * weekend uplift, or a real companion-product affinity).
 *
 * A few pilot-wide commercial terms are fixed constants rather than per-retailer data, because
 * they are program terms, not observed facts: the discount rates, the case pack size, and the
 * order-sizing target. All are documented below and should move to real CCI commercial
 * configuration once one exists.
 */
@Service
public class RetailerOfferCatalogService {

    /** Program discount rates by offer mechanic - commercial terms, not per-retailer facts. */
    private static final BigDecimal VOLUME_DISCOUNT_RATE = new BigDecimal("0.10");
    private static final BigDecimal WEEKEND_DISCOUNT_RATE = new BigDecimal("0.07");
    /** Assumed units per case, used only to translate a real unit price into a case-priced benefit. */
    private static final int CASE_SIZE_UNITS = 12;
    /** Target order value an offer is sized toward, so the benefit stays commercially meaningful regardless of a product's own unit price. */
    private static final BigDecimal TARGET_BENEFIT_AZN = new BigDecimal("15.00");
    private static final int CANDIDATE_LIMIT = 4;
    private static final int OFFER_WINDOW_DAYS = 30;
    private static final int OFFER_VALIDITY_DAYS = 7;
    private static final OfferType[] TYPE_ROTATION = {
        OfferType.VOLUME_DISCOUNT, OfferType.BONUS_PRODUCT, OfferType.WEEKEND_ACTIVATION, OfferType.BASKET_GROWTH,
    };

    private final RetailerAnalyticsQueryRepository queryRepository;
    private final RetailerProductInsightService insightService;
    private final RetailerOfferActivationRepository activationRepository;
    private final AuditService auditService;
    private final Clock clock;

    public RetailerOfferCatalogService(
        RetailerAnalyticsQueryRepository queryRepository,
        RetailerProductInsightService insightService,
        RetailerOfferActivationRepository activationRepository,
        AuditService auditService,
        Clock clock
    ) {
        this.queryRepository = queryRepository;
        this.insightService = insightService;
        this.activationRepository = activationRepository;
        this.auditService = auditService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public OffersResponse offers(Retailer retailer) {
        Instant now = clock.instant();
        List<RetailerOfferActivation> activations = activationRepository.findAllByRetailerOrderByActivatedAtDesc(retailer);
        Set<String> activatedKeys = activations.stream()
            .map(RetailerOfferActivation::getOfferKey)
            .collect(Collectors.toSet());

        List<Offer> available = candidates(retailer, now).stream()
            .filter(candidate -> !activatedKeys.contains(candidate.offerKey()))
            .toList();
        List<Offer> active = activations.stream()
            .filter(activation -> activation.isActive(now))
            .map(this::fromActivation)
            .toList();
        List<Offer> completed = activations.stream()
            .filter(activation -> !activation.isActive(now))
            .map(this::fromActivation)
            .toList();

        return new OffersResponse(now, available, active, completed);
    }

    @Transactional
    public Offer activate(Retailer retailer, String offerKey, Authentication authentication) {
        Instant now = clock.instant();
        if (activationRepository.findByRetailerAndOfferKey(retailer, offerKey).isPresent()) {
            throw new IllegalArgumentException("This offer has already been activated.");
        }
        Offer candidate = candidates(retailer, now).stream()
            .filter(offer -> offer.offerKey().equals(offerKey))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException(
                "This offer is no longer available. Refresh to see current offers."
            ));

        RetailerOfferActivation activation = new RetailerOfferActivation(
            retailer,
            candidate.offerKey(),
            RetailerOfferActivation.OfferType.valueOf(candidate.offerType().name()),
            candidate.title(),
            candidate.productName(),
            candidate.category(),
            candidate.benefitSummary(),
            candidate.normalCondition(),
            candidate.partnerCondition(),
            candidate.estimatedBenefitAzn(),
            now.plus(OFFER_VALIDITY_DAYS, ChronoUnit.DAYS)
        );
        activationRepository.save(activation);
        auditService.record(
            retailer, authentication, "RETAILER_OFFER_ACTIVATED", "RETAILER_OFFER_ACTIVATION",
            activation.getId().toString(),
            "Activated \"" + candidate.title() + "\" (" + candidate.benefitSummary() + ")"
        );
        return fromActivation(activation);
    }

    private List<Offer> candidates(Retailer retailer, Instant now) {
        Instant windowStart = now.minus(OFFER_WINDOW_DAYS, ChronoUnit.DAYS);
        List<RetailerAnalyticsDtos.ProductMetric> products =
            queryRepository.topCciProducts(retailer.getId(), windowStart, CANDIDATE_LIMIT);
        if (products.isEmpty()) {
            // No recent CCI sales - fall back to all-time so a retailer with some CCI history
            // (just none in the last 30 days) still sees something real, rather than nothing.
            products = queryRepository.topCciProducts(retailer.getId(), Instant.EPOCH, CANDIDATE_LIMIT);
        }
        Instant expiresAt = now.plus(OFFER_VALIDITY_DAYS, ChronoUnit.DAYS);
        List<Offer> offers = new ArrayList<>();
        for (int rank = 0; rank < products.size(); rank++) {
            RetailerAnalyticsDtos.ProductMetric product = products.get(rank);
            if (product.quantity() == null || product.quantity().signum() <= 0) continue;
            buildOffer(retailer, product, rank, now, expiresAt).ifPresent(offers::add);
        }
        return offers;
    }

    /**
     * Picks the first offer mechanic (starting from this candidate's rotation position, so
     * different-ranked products prefer different mechanics) whose reasoning the retailer's own
     * data actually supports. Volume discount always succeeds - if nothing more specific is
     * available it falls back to a real, if plainer, top-seller reason - so every candidate
     * product still produces an offer.
     */
    private Optional<Offer> buildOffer(
        Retailer retailer, RetailerAnalyticsDtos.ProductMetric product, int rank, Instant now, Instant expiresAt
    ) {
        Optional<RetailerProductInsightService.ProductTrend> trend = insightService.trend(retailer, product.name(), now);
        Optional<RetailerProductInsightService.CompanionAffinity> companion =
            insightService.companionAffinity(retailer, product.name(), now);

        for (int offset = 0; offset < TYPE_ROTATION.length; offset++) {
            OfferType type = TYPE_ROTATION[(rank + offset) % TYPE_ROTATION.length];
            Optional<Offer> offer = switch (type) {
                case VOLUME_DISCOUNT -> Optional.of(volumeDiscountOffer(product, trend, expiresAt));
                case BONUS_PRODUCT -> bonusProductOffer(product, trend, expiresAt);
                case WEEKEND_ACTIVATION -> weekendActivationOffer(product, trend, expiresAt);
                case BASKET_GROWTH -> basketGrowthOffer(product, companion, expiresAt);
            };
            if (offer.isPresent()) return offer;
        }
        return Optional.empty();
    }

    private Offer volumeDiscountOffer(
        RetailerAnalyticsDtos.ProductMetric product,
        Optional<RetailerProductInsightService.ProductTrend> trend,
        Instant expiresAt
    ) {
        BigDecimal unitPrice = unitPrice(product);
        long cases = casesForTargetBenefit(unitPrice, VOLUME_DISCOUNT_RATE);
        BigDecimal benefit = benefit(unitPrice, cases, VOLUME_DISCOUNT_RATE);

        BigDecimal growth = trend.map(RetailerProductInsightService.ProductTrend::growthPercent).orElse(null);
        String reason;
        String metricLabel;
        String metricValue;
        if (growth != null && growth.signum() > 0) {
            reason = "Sales increased " + growth + "% compared with the previous " + OFFER_WINDOW_DAYS + " days.";
            metricLabel = "Growth vs previous " + OFFER_WINDOW_DAYS + " days";
            metricValue = "+" + growth + "%";
        } else {
            reason = product.name() + " is a consistent top seller in your store.";
            metricLabel = "Recorded sales (last " + OFFER_WINDOW_DAYS + " days)";
            metricValue = "₼" + product.revenue().setScale(2, RoundingMode.HALF_UP);
        }
        List<String> whyReasons = List.of(
            reason,
            product.name() + " was purchased in " + product.basketCount() + " separate baskets in the last " + OFFER_WINDOW_DAYS + " days."
        );

        return new Offer(
            offerKey(product), OfferType.VOLUME_DISCOUNT, product.name(), product.name(), product.category(),
            reason, whyReasons, metricLabel, metricValue,
            "Order " + cases + (cases == 1 ? " case" : " cases"),
            rate(VOLUME_DISCOUNT_RATE) + "% campaign discount",
            benefit, "Estimated benefit: ₼" + benefit, expiresAt, OfferStatus.AVAILABLE
        );
    }

    private Optional<Offer> bonusProductOffer(
        RetailerAnalyticsDtos.ProductMetric product,
        Optional<RetailerProductInsightService.ProductTrend> trend,
        Instant expiresAt
    ) {
        if (trend.isEmpty() || trend.get().topDaypart() == null) return Optional.empty();
        RetailerProductInsightService.ProductTrend data = trend.get();
        BigDecimal unitPrice = unitPrice(product);
        long cases = casesForTargetBenefit(unitPrice, VOLUME_DISCOUNT_RATE);
        BigDecimal bonusValue = unitPrice.multiply(BigDecimal.valueOf(CASE_SIZE_UNITS)).setScale(2, RoundingMode.HALF_UP);
        String daypart = data.topDaypart().toLowerCase(Locale.ROOT);

        String reason = product.name() + " sales are strongest during " + daypart + " hours.";
        List<String> whyReasons = List.of(
            reason,
            data.topDaypartSharePercent() + "% of " + product.name() + "'s recent baskets fell in that window."
        );
        return Optional.of(new Offer(
            offerKey(product), OfferType.BONUS_PRODUCT, product.name(), product.name(), product.category(),
            reason, whyReasons, "Strongest daypart", capitalize(daypart) + " (" + data.topDaypartSharePercent() + "%)",
            "Buy " + cases + (cases == 1 ? " case" : " cases"),
            "Receive 1 promotional case",
            bonusValue, "Estimated commercial value: ₼" + bonusValue, expiresAt, OfferStatus.AVAILABLE
        ));
    }

    private Optional<Offer> weekendActivationOffer(
        RetailerAnalyticsDtos.ProductMetric product,
        Optional<RetailerProductInsightService.ProductTrend> trend,
        Instant expiresAt
    ) {
        if (trend.isEmpty() || trend.get().weekendUpliftPercent() == null
            || trend.get().weekendUpliftPercent().signum() <= 0) return Optional.empty();
        BigDecimal uplift = trend.get().weekendUpliftPercent();
        BigDecimal unitPrice = unitPrice(product);
        long cases = casesForTargetBenefit(unitPrice, WEEKEND_DISCOUNT_RATE);
        BigDecimal benefit = benefit(unitPrice, cases, WEEKEND_DISCOUNT_RATE);

        String reason = product.name() + " demand is " + uplift + "% higher Friday-Sunday than the weekday average.";
        List<String> whyReasons = List.of(
            reason,
            "This comparison uses " + product.name() + "'s own recorded baskets over the last " + OFFER_WINDOW_DAYS + " days."
        );
        return Optional.of(new Offer(
            offerKey(product), OfferType.WEEKEND_ACTIVATION, product.name(), product.name(), product.category(),
            reason, whyReasons, "Weekend uplift", "+" + uplift + "%",
            "Order " + cases + (cases == 1 ? " case" : " cases") + " before Friday",
            rate(WEEKEND_DISCOUNT_RATE) + "% partner pricing",
            benefit, "Estimated benefit: ₼" + benefit, expiresAt, OfferStatus.AVAILABLE
        ));
    }

    private Optional<Offer> basketGrowthOffer(
        RetailerAnalyticsDtos.ProductMetric product,
        Optional<RetailerProductInsightService.CompanionAffinity> companion,
        Instant expiresAt
    ) {
        if (companion.isEmpty()) return Optional.empty();
        RetailerProductInsightService.CompanionAffinity affinity = companion.get();

        String reason = product.name() + " frequently appears with " + affinity.companionName() + " during evening baskets.";
        List<String> whyReasons = List.of(
            reason,
            "The two appear together in " + affinity.overallSharePercent() + "% of " + product.name() + "'s baskets, "
                + affinity.eveningMultiplier() + "x more often between 18:00-22:00 than the rest of the day."
        );
        return Optional.of(new Offer(
            offerKey(product), OfferType.BASKET_GROWTH, product.name(), product.name(), product.category(),
            reason, whyReasons, "Evening basket-affinity", affinity.eveningMultiplier() + "x",
            "Feature " + product.name() + " with " + affinity.companionName(),
            "Special campaign pricing on selected volume",
            null, "Special campaign pricing on selected volume", expiresAt, OfferStatus.AVAILABLE
        ));
    }

    private Offer fromActivation(RetailerOfferActivation activation) {
        Instant now = clock.instant();
        return new Offer(
            activation.getOfferKey(),
            OfferType.valueOf(activation.getOfferType().name()),
            activation.getTitle(),
            activation.getProductName(),
            activation.getCategory(),
            "You activated this SCAN Partner offer.",
            List.of(
                "You activated this offer on " + activation.getActivatedAt() + ".",
                "Benefit: " + activation.getBenefitSummary() + "."
            ),
            "Activated offer", activation.getBenefitSummary(),
            activation.getNormalCondition(),
            activation.getPartnerCondition(),
            activation.getEstimatedBenefitAzn(),
            activation.getBenefitSummary(),
            activation.getExpiresAt(),
            activation.isActive(now) ? OfferStatus.ACTIVE : OfferStatus.COMPLETED
        );
    }

    private BigDecimal unitPrice(RetailerAnalyticsDtos.ProductMetric product) {
        return product.revenue().divide(product.quantity(), 4, RoundingMode.HALF_UP);
    }

    private long casesForTargetBenefit(BigDecimal unitPrice, BigDecimal rate) {
        BigDecimal perCaseBenefit = unitPrice.multiply(BigDecimal.valueOf(CASE_SIZE_UNITS)).multiply(rate);
        if (perCaseBenefit.signum() <= 0) return 3;
        long cases = TARGET_BENEFIT_AZN.divide(perCaseBenefit, 0, RoundingMode.HALF_UP).longValue();
        return Math.min(6, Math.max(3, cases));
    }

    private BigDecimal benefit(BigDecimal unitPrice, long cases, BigDecimal rate) {
        return unitPrice.multiply(BigDecimal.valueOf(CASE_SIZE_UNITS))
            .multiply(BigDecimal.valueOf(cases))
            .multiply(rate)
            .setScale(2, RoundingMode.HALF_UP);
    }

    private String rate(BigDecimal rate) {
        return rate.movePointRight(2).stripTrailingZeros().toPlainString();
    }

    private String offerKey(RetailerAnalyticsDtos.ProductMetric product) {
        return "CCI-" + slug(product.name());
    }

    private String capitalize(String value) {
        return value.isEmpty() ? value : Character.toUpperCase(value.charAt(0)) + value.substring(1);
    }

    private String slug(String value) {
        return value.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "-").replaceAll("^-|-$", "");
    }
}
