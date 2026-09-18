package az.cci.scan.analytics;

import az.cci.scan.config.TenantAccessService;
import az.cci.scan.domain.Retailer;
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
    private final TenantAccessService tenantAccess;

    public AnalyticsController(AnalyticsService analyticsService, TenantAccessService tenantAccess) {
        this.analyticsService = analyticsService;
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

    public record AnalyticsContextResponse(List<RetailerAccessResponse> retailers) {
    }

    public record RetailerAccessResponse(String code, String name, boolean demoData) {
    }
}
