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
import java.util.Set;
import java.util.stream.Collectors;

import static az.cci.scan.retailer.RetailerEngagementDtos.Offer;
import static az.cci.scan.retailer.RetailerEngagementDtos.OfferStatus;
import static az.cci.scan.retailer.RetailerEngagementDtos.OffersResponse;

/**
 * Turns a retailer's own recorded CCI-product sales into commercial offer recommendations.
 * Nothing here is hardcoded demo copy: the candidate products, the "why you're seeing this"
 * reasons, and the estimated benefit are all computed from that retailer's real transaction data,
 * so a retailer with no CCI product sales correctly sees no offers rather than a placeholder.
 *
 * Two pilot-wide commercial terms are fixed constants rather than per-retailer data, because they
 * are program terms, not observed facts: the standard SCAN Partner discount rate and the assumed
 * case pack size used to size a suggested order. Both are documented below and should move to
 * real CCI commercial configuration once one exists.
 */
@Service
public class RetailerOfferCatalogService {

    /** Standard SCAN Gold Partner discount rate for this pilot. A commercial program term, not a per-retailer fact. */
    private static final BigDecimal DISCOUNT_RATE = new BigDecimal("0.08");
    /** Assumed units per case for a suggested order, used only to translate real unit demand into a case count. */
    private static final int CASE_SIZE_UNITS = 12;
    private static final int CANDIDATE_LIMIT = 4;
    private static final int OFFER_WINDOW_DAYS = 30;
    private static final int OFFER_VALIDITY_DAYS = 7;

    private final RetailerAnalyticsQueryRepository queryRepository;
    private final RetailerOfferActivationRepository activationRepository;
    private final AuditService auditService;
    private final Clock clock;

    public RetailerOfferCatalogService(
        RetailerAnalyticsQueryRepository queryRepository,
        RetailerOfferActivationRepository activationRepository,
        AuditService auditService,
        Clock clock
    ) {
        this.queryRepository = queryRepository;
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
            offers.add(toOffer(product, rank, expiresAt));
        }
        return offers;
    }

    private Offer toOffer(RetailerAnalyticsDtos.ProductMetric product, int rank, Instant expiresAt) {
        BigDecimal unitPrice = product.revenue().divide(product.quantity(), 2, RoundingMode.HALF_UP);
        long suggestedCases = clampCases(product.quantity());
        BigDecimal grossOrderValue = unitPrice
            .multiply(BigDecimal.valueOf(CASE_SIZE_UNITS))
            .multiply(BigDecimal.valueOf(suggestedCases));
        BigDecimal estimatedBenefit = grossOrderValue.multiply(DISCOUNT_RATE).setScale(2, RoundingMode.HALF_UP);

        String offerKey = "CCI-" + slug(product.name());
        String normalCondition = "Order " + suggestedCases + (suggestedCases == 1 ? " case" : " cases");
        String partnerCondition = DISCOUNT_RATE.movePointRight(2).stripTrailingZeros().toPlainString() + "% partner discount";
        String benefitSummary = "Save ₼" + estimatedBenefit;

        return new Offer(
            offerKey,
            product.name(),
            product.name(),
            product.category(),
            reason(product, rank),
            whyReasons(product),
            normalCondition,
            partnerCondition,
            estimatedBenefit,
            benefitSummary,
            expiresAt,
            OfferStatus.AVAILABLE
        );
    }

    private Offer fromActivation(RetailerOfferActivation activation) {
        Instant now = clock.instant();
        return new Offer(
            activation.getOfferKey(),
            activation.getTitle(),
            activation.getProductName(),
            activation.getCategory(),
            "You activated this SCAN Partner offer.",
            List.of(
                "You activated this offer on " + activation.getActivatedAt() + ".",
                "Benefit: " + activation.getBenefitSummary() + "."
            ),
            activation.getNormalCondition(),
            activation.getPartnerCondition(),
            activation.getEstimatedBenefitAzn(),
            activation.getBenefitSummary(),
            activation.getExpiresAt(),
            activation.isActive(now) ? OfferStatus.ACTIVE : OfferStatus.COMPLETED
        );
    }

    private long clampCases(BigDecimal quantity) {
        // Roughly one month of recent demand, expressed in cases, bounded to a sane order size.
        long rawCases = quantity
            .divide(BigDecimal.valueOf(CASE_SIZE_UNITS), 0, RoundingMode.HALF_UP)
            .divide(BigDecimal.valueOf(4), 0, RoundingMode.HALF_UP)
            .longValue();
        return Math.min(5, Math.max(2, rawCases));
    }

    private String reason(RetailerAnalyticsDtos.ProductMetric product, int rank) {
        return switch (rank) {
            case 0 -> product.name() + " is your top CCI seller by recorded revenue, with ₼"
                + product.revenue().setScale(2, RoundingMode.HALF_UP) + " over the last " + OFFER_WINDOW_DAYS + " days.";
            case 1 -> product.quantity().stripTrailingZeros().toPlainString() + " units of " + product.name()
                + " sold in the last " + OFFER_WINDOW_DAYS + " days - strong enough demand for a bulk order discount.";
            default -> product.name() + " appeared in " + product.basketCount()
                + " separate baskets over the last " + OFFER_WINDOW_DAYS + " days.";
        };
    }

    private List<String> whyReasons(RetailerAnalyticsDtos.ProductMetric product) {
        return List.of(
            product.name() + " generated ₼" + product.revenue().setScale(2, RoundingMode.HALF_UP)
                + " in recorded sales over the last " + OFFER_WINDOW_DAYS + " days.",
            "It was purchased in " + product.basketCount() + " separate baskets in that period."
        );
    }

    private String slug(String value) {
        return value.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "-").replaceAll("^-|-$", "");
    }
}
