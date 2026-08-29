package az.cci.scan.retailer;

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

    public RetailerAnalyticsController(RetailerAnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/overview")
    public OverviewResponse overview(
        @RequestParam(defaultValue = "ALL_TIME") Period period
    ) {
        return analyticsService.overview(period);
    }
}
