package az.cci.scan.intelligence;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Every number here comes straight out of {@link IntelligenceQueryRepository}. Nothing in this
 * file is inferred, guessed, or written by a model - it's the deterministic "structured result"
 * half of the USER -> INTENT -> ANALYTICS TOOL -> STRUCTURED RESULT -> AI INTERPRETATION pipeline.
 * Copilot and the investigation workspace narrate these numbers; they never invent their own.
 * Public: AnalyticsController (a different package) surfaces {@link ProductMover} directly as the
 * "what needs attention" feed for My Work.
 */
public final class ChangeDetectionDtos {

    private ChangeDetectionDtos() {
    }

    public record Window(Instant start, Instant end) {
    }

    public record PeriodComparison(Window recent, Window prior) {
    }

    /** Overall CCI presence across baskets, recent window vs. the prior window of equal length. */
    public record NetworkChange(
        PeriodComparison period,
        long recentBaskets,
        long recentCciBaskets,
        long priorBaskets,
        long priorCciBaskets,
        double recentPenetrationPct,
        double priorPenetrationPct,
        double penetrationPointChange
    ) {
    }

    /** One CCI product's basket count moving between two equal-length windows. */
    public record ProductMover(
        String productName,
        String category,
        long recentBaskets,
        long priorBaskets,
        BigDecimal recentRevenue,
        BigDecimal priorRevenue,
        double basketChangePct
    ) {
    }

    /** A single store's contribution to a product's basket-count change between two windows. */
    public record StoreContribution(
        String externalStoreId,
        long recentProductBaskets,
        long priorProductBaskets,
        long recentStoreBaskets,
        long priorStoreBaskets,
        double recentPenetrationPct,
        double priorPenetrationPct,
        long basketDelta
    ) {
    }

    /**
     * A signal is only included when the underlying numbers actually support it - these map 1:1
     * to the two hypothesis types this codebase is willing to generate (see
     * {@code InvestigationService}). There is deliberately no "competitive substitution" signal:
     * SCAN has no competitor-product data source anywhere in its schema, so a model asked to
     * explain a decline must not be allowed to claim one.
     */
    public record ProductChange(
        String productName,
        PeriodComparison period,
        long recentBaskets,
        long priorBaskets,
        BigDecimal recentRevenue,
        BigDecimal priorRevenue,
        double basketChangePct,
        List<StoreContribution> storeContributions,
        boolean availabilitySignal,
        String availabilityEvidence,
        boolean concentrationSignal,
        String concentrationEvidence
    ) {
    }
}
