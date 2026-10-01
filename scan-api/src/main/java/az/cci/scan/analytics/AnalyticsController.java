package az.cci.scan.analytics;

import az.cci.scan.config.TenantAccessService;
import az.cci.scan.domain.Retailer;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
import az.cci.scan.intelligence.ChangeDetectionService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static az.cci.scan.analytics.AnalyticsDtos.OverviewResponse;

@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;
    private final ChangeDetectionService changeDetectionService;
    private final TenantAccessService tenantAccess;

    public AnalyticsController(
        AnalyticsService analyticsService,
        ChangeDetectionService changeDetectionService,
        TenantAccessService tenantAccess
    ) {
        this.analyticsService = analyticsService;
        this.changeDetectionService = changeDetectionService;
        this.tenantAccess = tenantAccess;
    }

    @GetMapping("/context")
    public AnalyticsContextResponse context(Authentication authentication) {
        return new AnalyticsContextResponse(tenantAccess.cciRetailers(authentication).stream()
            .map(retailer -> new RetailerAccessResponse(
                retailer.getCode(),
                retailer.getName(),
                retailer.getCode().equals("KAGGLE") || retailer.getCode().equals("DEMO")
            ))
            .toList());
    }

    @GetMapping("/overview")
    public OverviewResponse overview(
        @RequestParam String retailerCode,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return analyticsService.overview(retailer.getCode(), true);
    }

    /**
     * The biggest real movers (declines first) over a recent-vs-prior window - the feed My Work's
     * "Needs Attention" cards are built from. Every entry here is a real, computed basket-count
     * change; nothing is guessed or ranked by anything but the actual numbers.
     */
    @GetMapping("/movers")
    public List<ProductMover> movers(
        @RequestParam String retailerCode,
        @RequestParam(defaultValue = "14") int periodDays,
        @RequestParam(defaultValue = "10") int limit,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return changeDetectionService.biggestDecliners(retailer, periodDays, limit);
    }

    public record AnalyticsContextResponse(List<RetailerAccessResponse> retailers) {
    }

    public record RetailerAccessResponse(String code, String name, boolean demoData) {
    }
}
