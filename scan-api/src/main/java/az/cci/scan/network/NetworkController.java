package az.cci.scan.network;

import az.cci.scan.config.TenantAccessService;
import az.cci.scan.domain.Retailer;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
import az.cci.scan.network.NetworkDtos.BriefItem;
import az.cci.scan.network.NetworkDtos.CategoryMover;
import az.cci.scan.network.NetworkDtos.NetworkOverview;
import az.cci.scan.network.NetworkDtos.ProductDetail;
import az.cci.scan.network.NetworkDtos.StoreDetail;
import az.cci.scan.network.NetworkDtos.StoreRanking;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * "All stores" as a real default: every endpoint here aggregates across the signed-in CCI
 * account's full set of accessible retailers (resolved once via TenantAccessService.cciRetailers)
 * - there is no retailerCode parameter anywhere in this controller, deliberately. Drill-down
 * actions (open a store, start an investigation) still resolve to one retailer under the hood,
 * but the network-level pages never ask the user to pick one first.
 */
@RestController
@RequestMapping("/api/v1/network")
public class NetworkController {

    private static final int DEFAULT_PERIOD_DAYS = 30;
    private static final int DEFAULT_MOVERS_LIMIT = 10;

    private final NetworkAnalyticsService networkAnalyticsService;
    private final TenantAccessService tenantAccess;

    public NetworkController(NetworkAnalyticsService networkAnalyticsService, TenantAccessService tenantAccess) {
        this.networkAnalyticsService = networkAnalyticsService;
        this.tenantAccess = tenantAccess;
    }

    @GetMapping("/overview")
    public NetworkOverview overview(
        @RequestParam(defaultValue = "" + DEFAULT_PERIOD_DAYS) int periodDays,
        Authentication authentication
    ) {
        return networkAnalyticsService.overview(retailers(authentication), periodDays);
    }

    @GetMapping("/stores")
    public List<StoreRanking> stores(
        @RequestParam(defaultValue = "" + DEFAULT_PERIOD_DAYS) int periodDays,
        Authentication authentication
    ) {
        return networkAnalyticsService.storeRanking(retailers(authentication), periodDays);
    }

    @GetMapping("/movers/products")
    public List<ProductMover> productMovers(
        @RequestParam(defaultValue = "" + DEFAULT_PERIOD_DAYS) int periodDays,
        @RequestParam(defaultValue = "" + DEFAULT_MOVERS_LIMIT) int limit,
        Authentication authentication
    ) {
        return networkAnalyticsService.productMovers(retailers(authentication), periodDays, limit);
    }

    @GetMapping("/movers/categories")
    public List<CategoryMover> categoryMovers(
        @RequestParam(defaultValue = "" + DEFAULT_PERIOD_DAYS) int periodDays,
        @RequestParam(defaultValue = "" + DEFAULT_MOVERS_LIMIT) int limit,
        Authentication authentication
    ) {
        return networkAnalyticsService.categoryMovers(retailers(authentication), periodDays, limit);
    }

    @GetMapping("/brief")
    public List<BriefItem> brief(
        @RequestParam(defaultValue = "" + DEFAULT_PERIOD_DAYS) int periodDays,
        Authentication authentication
    ) {
        return networkAnalyticsService.commercialBrief(retailers(authentication), periodDays);
    }

    // retailerCode + externalStoreId are query params, not path segments: an external store id can
    // legitimately contain a "/" (seen in real retailer exports), which would otherwise break path
    // matching or require fragile encoding on the frontend.
    @GetMapping("/stores/detail")
    public StoreDetail storeDetail(
        @RequestParam String retailerCode,
        @RequestParam String externalStoreId,
        @RequestParam(defaultValue = "" + DEFAULT_PERIOD_DAYS) int periodDays,
        Authentication authentication
    ) {
        List<Retailer> retailers = retailers(authentication);
        Retailer target = tenantAccess.cciRetailer(authentication, retailerCode);
        return networkAnalyticsService.storeDetail(retailers, target, externalStoreId, periodDays);
    }

    @GetMapping("/products/detail")
    public ProductDetail productDetail(
        @RequestParam String product,
        @RequestParam(defaultValue = "" + DEFAULT_PERIOD_DAYS) int periodDays,
        Authentication authentication
    ) {
        return networkAnalyticsService.productDetail(retailers(authentication), product, periodDays);
    }

    private List<Retailer> retailers(Authentication authentication) {
        List<Retailer> retailers = tenantAccess.cciRetailers(authentication);
        if (retailers.isEmpty()) {
            throw new AccessDeniedException("This account has no retailer analytics assigned");
        }
        return retailers;
    }
}
