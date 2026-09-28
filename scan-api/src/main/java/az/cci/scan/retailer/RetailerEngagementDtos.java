package az.cci.scan.retailer;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Data structures for the retailer-side "what do I get from SCAN" experience: commercial offers,
 * simple recommended actions, and SCAN Partner standing. Every number in here is computed live
 * from a retailer's own recorded transactions (see RetailerOfferCatalogService,
 * RetailerActionService, RetailerPartnerStatusService) - nothing is hardcoded demo copy, so a
 * retailer with no CCI product sales yet correctly sees empty states rather than someone else's
 * numbers.
 */
public final class RetailerEngagementDtos {

    private RetailerEngagementDtos() {
    }

    public enum OfferStatus {
        AVAILABLE,
        ACTIVE,
        COMPLETED
    }

    public record Offer(
        String offerKey,
        String title,
        String productName,
        String category,
        String reason,
        List<String> whyReasons,
        String normalCondition,
        String partnerCondition,
        BigDecimal estimatedBenefitAzn,
        String benefitSummary,
        Instant expiresAt,
        OfferStatus status
    ) {
    }

    public record OffersResponse(
        Instant generatedAt,
        List<Offer> available,
        List<Offer> active,
        List<Offer> completed
    ) {
    }

    public enum ActionType {
        URGENT,
        OPPORTUNITY,
        INVENTORY,
        PERFORMANCE
    }

    public record Action(
        String id,
        ActionType type,
        String title,
        String explanation,
        String recommendation,
        String metricLabel,
        String metricValue
    ) {
    }

    public record PartnerRequirement(
        String label,
        boolean met
    ) {
    }

    public record BenefitSummary(
        BigDecimal thisMonth,
        BigDecimal lastMonth,
        BigDecimal lifetime
    ) {
    }

    public record BenefitHistoryEntry(
        Instant activatedAt,
        String title,
        String benefitSummary,
        BigDecimal estimatedBenefitAzn
    ) {
    }

    public record PartnerStatusResponse(
        String level,
        int progressPercentage,
        String nextLevel,
        Integer daysUntilNextLevel,
        List<PartnerRequirement> requirements,
        BenefitSummary benefits,
        List<BenefitHistoryEntry> benefitHistory
    ) {
    }
}
