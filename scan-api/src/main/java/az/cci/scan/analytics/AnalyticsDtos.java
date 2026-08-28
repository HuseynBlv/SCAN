package az.cci.scan.analytics;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AnalyticsDtos {

    private AnalyticsDtos() {
    }

    public record CompanionMetric(
        String name,
        long basketCount,
        BigDecimal attachmentRatePercentage
    ) {
    }

    public record CategoryMetric(
        String category,
        long basketCount,
        BigDecimal attachmentRatePercentage
    ) {
    }

    public record CciSkuMetric(
        UUID productId,
        String product,
        long basketCount,
        BigDecimal quantity,
        BigDecimal revenue
    ) {
    }

    public record SegmentMetric(String segment, long basketCount, BigDecimal sharePercentage) {
    }

    public record StoreMetric(
        String storeId,
        long basketCount,
        long cciBasketCount,
        BigDecimal cciPenetrationPercentage,
        BigDecimal averageBasketValue
    ) {
    }

    public record Insight(
        String fact,
        String interpretation,
        String recommendedAction
    ) {
    }

    public record OverviewResponse(
        Instant generatedAt,
        String retailerCode,
        String retailerName,
        long totalBaskets,
        long cciBaskets,
        BigDecimal cciPenetrationPercentage,
        BigDecimal averageBasketValue,
        String currency,
        BigDecimal mappedLinePercentage,
        List<CompanionMetric> topCompanionProducts,
        List<CategoryMetric> topCompanionCategories,
        List<CciSkuMetric> cciSkuPerformance,
        List<SegmentMetric> dayparts,
        List<SegmentMetric> weekdayWeekend,
        List<StoreMetric> stores,
        List<Insight> insights
    ) {
        OverviewResponse withInsights(List<Insight> nextInsights) {
            return new OverviewResponse(
                generatedAt,
                retailerCode,
                retailerName,
                totalBaskets,
                cciBaskets,
                cciPenetrationPercentage,
                averageBasketValue,
                currency,
                mappedLinePercentage,
                topCompanionProducts,
                topCompanionCategories,
                cciSkuPerformance,
                dayparts,
                weekdayWeekend,
                stores,
                List.copyOf(nextInsights)
            );
        }
    }
}
