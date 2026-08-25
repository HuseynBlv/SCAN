package az.cci.scan.analytics;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static az.cci.scan.analytics.AnalyticsDtos.OverviewResponse;

@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/overview")
    public OverviewResponse overview(
        @RequestParam String retailerCode,
        Authentication authentication
    ) {
        boolean cciUser = authentication.getAuthorities().stream()
            .anyMatch(authority -> authority.getAuthority().equals("ROLE_CCI"));
        return analyticsService.overview(retailerCode, cciUser);
    }
}
