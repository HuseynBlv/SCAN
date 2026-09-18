package az.cci.scan.retailer;

import az.cci.scan.config.TenantAccessService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static az.cci.scan.retailer.RetailerAnalyticsDtos.OverviewResponse;
import static az.cci.scan.retailer.RetailerAnalyticsDtos.Period;

@RestController
@RequestMapping("/api/v1/retailer")
public class RetailerAnalyticsController {

    private final RetailerAnalyticsService analyticsService;
    private final TenantAccessService tenantAccess;

    public RetailerAnalyticsController(
        RetailerAnalyticsService analyticsService,
        TenantAccessService tenantAccess
    ) {
        this.analyticsService = analyticsService;
        this.tenantAccess = tenantAccess;
    }

    @GetMapping("/overview")
    public OverviewResponse overview(
        @RequestParam(defaultValue = "ALL_TIME") Period period,
        Authentication authentication
    ) {
        return analyticsService.overview(period, tenantAccess.retailer(authentication));
    }
}
