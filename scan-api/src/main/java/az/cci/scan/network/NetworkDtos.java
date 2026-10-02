package az.cci.scan.network;

import java.time.Instant;

/**
 * Network-wide results - every number aggregated across the CCI account's full set of accessible
 * retailers, not one. See NetworkAnalyticsService for how each is computed; nothing here is
 * invented, and a store's retailerCode always rides along so a drill-down action (field check,
 * investigation) can resolve back to the one retailer it actually belongs to.
 */
final class NetworkDtos {

    private NetworkDtos() {
    }

    record NetworkOverview(
        int periodDays,
        long storesReporting,
        long totalBaskets,
        long cciBaskets,
        double cciPenetrationPct,
        double priorCciPenetrationPct,
        double penetrationPointChange,
        double dataCoveragePct,
        Instant generatedAt
    ) {
    }

    record StoreRanking(
        String retailerCode,
        String externalStoreId,
        long recentBaskets,
        long recentCciBaskets,
        double recentPenetrationPct,
        long priorBaskets,
        long priorCciBaskets,
        double priorPenetrationPct,
        double penetrationPointChange,
        String status
    ) {
    }

    record CategoryMover(String category, long recentBaskets, long priorBaskets, double basketChangePct) {
    }

    /**
     * One entry in the AI Commercial Brief. type/actionType let the frontend route "Understand why"
     * to the right next step (e.g. start a product investigation) without the backend prescribing UI.
     */
    record BriefItem(String type, String title, String description, String actionLabel, String actionType, String actionTarget) {
    }
}
