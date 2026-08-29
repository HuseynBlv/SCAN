package az.cci.scan.retailer;

import az.cci.scan.domain.ImportJob;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class RetailerAnalyticsDtos {

    private RetailerAnalyticsDtos() {
    }

    public enum Period {
        TODAY,
        LAST_7_DAYS,
        LAST_30_DAYS,
        ALL_TIME
    }

    public record ProductMetric(
        String name,
        String category,
        long basketCount,
        BigDecimal quantity,
        BigDecimal revenue
    ) {
    }

    public record CategoryMetric(
        String category,
        long basketCount,
        BigDecimal quantity,
        BigDecimal revenue
    ) {
    }

    public record SegmentMetric(
        String segment,
        long basketCount,
        BigDecimal sharePercentage
    ) {
    }

    public record StoreMetric(
        String storeId,
        long basketCount,
        long cciBasketCount,
        BigDecimal totalSales,
        BigDecimal averageBasketValue
    ) {
    }

    public record DailyMetric(
        LocalDate date,
        long basketCount,
        BigDecimal totalSales
    ) {
    }

    public record SyncStatus(
        String state,
        String filename,
        int importedReceipts,
        int importedLines,
        int unresolvedProducts,
        List<String> errors,
        Instant receivedAt,
        Instant completedAt
    ) {

        static SyncStatus empty() {
            return new SyncStatus("NEVER_SYNCED", null, 0, 0, 0, List.of(), null, null);
        }

        static SyncStatus from(ImportJob job) {
            List<String> errors = job.getErrorSummary() == null || job.getErrorSummary().isBlank()
                ? List.of()
                : job.getErrorSummary().lines().limit(100).toList();
            return new SyncStatus(
                job.getStatus().name(),
                job.getOriginalFilename(),
                job.getImportedReceipts(),
                job.getImportedLines(),
                job.getUnresolvedProducts(),
                errors,
                job.getCreatedAt(),
                job.getCompletedAt()
            );
        }
    }

    public record Insight(
        String fact,
        String interpretation,
        String recommendedAction
    ) {
    }

    public record OverviewResponse(
        Instant generatedAt,
        Period period,
        Instant periodStart,
        String retailerCode,
        String retailerName,
        long totalBaskets,
        BigDecimal totalSales,
        BigDecimal averageBasketValue,
        BigDecimal totalItems,
        BigDecimal productsPerBasket,
        long cciBaskets,
        BigDecimal cciPenetrationPercentage,
        String currency,
        BigDecimal mappedLinePercentage,
        List<ProductMetric> topProducts,
        List<CategoryMetric> topCategories,
        List<SegmentMetric> dayparts,
        List<SegmentMetric> weekdayWeekend,
        List<StoreMetric> stores,
        List<DailyMetric> dailySales,
        List<Insight> insights,
        SyncStatus sync
    ) {
    }
}
