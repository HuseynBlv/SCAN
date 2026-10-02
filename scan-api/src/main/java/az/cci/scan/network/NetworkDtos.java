package az.cci.scan.network;

import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

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

    /** A label (product, category, or store) paired with how many baskets support it. */
    record NamedBasketCount(String label, long basketCount) {
    }

    /** One CCI product's current standing at a single store - not a change, just a ranking row. */
    record StoreProduct(String product, String category, long basketCount, BigDecimal quantity, BigDecimal revenue) {
    }

    /**
     * The Store detail page's full real picture of one store: its own penetration/trend, what it
     * sells, what moved, whether its data can be trusted, and - for "compare with similar stores" -
     * a few other real stores with the closest current penetration, excluding itself.
     */
    record StoreDetail(
        String retailerCode,
        String externalStoreId,
        String storeName,
        int periodDays,
        long recentBaskets,
        long recentCciBaskets,
        double recentPenetrationPct,
        long priorBaskets,
        long priorCciBaskets,
        double priorPenetrationPct,
        double penetrationPointChange,
        String status,
        List<StoreProduct> topProducts,
        List<ProductMover> biggestChanges,
        List<NamedBasketCount> topCompanionCategories,
        double dataCoveragePct,
        List<StoreRanking> similarStores
    ) {
    }

    /** One other store this product reaches, with its own recent/prior basket count and change. */
    record ProductStoreDistribution(String retailerCode, String externalStoreId, long recentBaskets, long priorBaskets, double basketChangePct) {
    }

    /**
     * The Product detail page's full real picture of one CCI product across the whole network: its
     * trend, which stores carry it (best and weakest are just this list sorted two ways by the
     * frontend), what it's bought alongside, and - only when the sample actually supports a claim -
     * which daypart it sells most strongly in.
     */
    record ProductDetail(
        String product,
        String category,
        String brand,
        int periodDays,
        long recentBaskets,
        long priorBaskets,
        double basketChangePct,
        BigDecimal recentRevenue,
        BigDecimal priorRevenue,
        List<ProductStoreDistribution> storeDistribution,
        List<NamedBasketCount> companionProducts,
        List<NamedBasketCount> companionCategories,
        String strongestDaypart,
        double strongestDaypartSharePct
    ) {
    }
}
