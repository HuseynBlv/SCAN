package az.cci.scan.retailer;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class RetailerOpportunityDtos {
    private RetailerOpportunityDtos() {
    }

    public enum OpportunityType { CROSS_SELL, BEVERAGE_ATTACHMENT, PRODUCT_TREND, TIME_PATTERN }
    public enum Priority { HIGH, MEDIUM, LOW }
    public enum Status { DETECTED, ACTIVE, COMPLETED }

    public record Evidence(
        long receiptCount,
        long supportingBasketCount,
        LocalDate dateFrom,
        LocalDate dateTo,
        BigDecimal dataCompletenessPercentage,
        String observation,
        String whyItMatters,
        String limitations
    ) {}

    public record RecommendedAction(String title, String description, int durationDays) {}

    public record Trial(
        UUID id,
        String status,
        LocalDate startDate,
        LocalDate endDate,
        LocalDate baselineFrom,
        LocalDate baselineTo,
        String metric,
        BigDecimal baselineValue,
        BigDecimal currentValue,
        Long currentNumerator,
        Long currentDenominator,
        String measurementNote
    ) {}

    public record Opportunity(
        String id,
        String storeId,
        OpportunityType type,
        String title,
        String description,
        List<String> subjects,
        Priority priority,
        Status status,
        Map<String, BigDecimal> metrics,
        String primaryMetricLabel,
        String primaryMetricValue,
        Evidence evidence,
        RecommendedAction recommendedAction,
        Trial trial,
        Instant detectedAt,
        Instant updatedAt
    ) {}

    public record Summary(
        Instant analyzedAt,
        Instant latestImportAt,
        String datasetKind,
        String coverageStatus,
        long receiptCount,
        BigDecimal mappingCoveragePercentage,
        int availableCount,
        int activeTrialCount,
        int completedTrialCount
    ) {}

    public record Response(Summary summary, List<Opportunity> opportunities) {}

    public record StartTrialRequest(
        @NotNull LocalDate startDate,
        @Min(3) @Max(90) Integer durationDays
    ) {}
}
