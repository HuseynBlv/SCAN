package az.cci.scan.analytics;

import az.cci.scan.config.TenantAccessService;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.ScanAccount;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
import az.cci.scan.intelligence.ChangeDetectionService;
import az.cci.scan.repository.ScanAccountRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;

import static az.cci.scan.analytics.AnalyticsDtos.OverviewResponse;

@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;
    private final ChangeDetectionService changeDetectionService;
    private final TenantAccessService tenantAccess;
    private final ScanAccountRepository accountRepository;

    public AnalyticsController(
        AnalyticsService analyticsService,
        ChangeDetectionService changeDetectionService,
        TenantAccessService tenantAccess,
        ScanAccountRepository accountRepository
    ) {
        this.analyticsService = analyticsService;
        this.changeDetectionService = changeDetectionService;
        this.tenantAccess = tenantAccess;
        this.accountRepository = accountRepository;
    }

    @GetMapping("/context")
    public AnalyticsContextResponse context(Authentication authentication) {
        return new AnalyticsContextResponse(
            tenantAccess.cciRetailers(authentication).stream()
                .map(retailer -> new RetailerAccessResponse(
                    retailer.getCode(),
                    retailer.getName(),
                    retailer.getCode().equals("KAGGLE") || retailer.getCode().equals("DEMO")
                ))
                .toList(),
            account(authentication).getCommercialRole().name()
        );
    }

    /**
     * A self-service UI preference, not an access change: lets a CCI account tell SCAN "I am Field
     * Sales" so My Work reorders what it shows first. See ScanAccount.CommercialRole.
     */
    @PutMapping("/context/commercial-role")
    @Transactional
    public AnalyticsContextResponse setCommercialRole(
        @Valid @RequestBody SetCommercialRoleRequest request,
        Authentication authentication
    ) {
        ScanAccount account = account(authentication);
        account.setCommercialRole(ScanAccount.CommercialRole.valueOf(request.commercialRole().toUpperCase(Locale.ROOT)));
        return context(authentication);
    }

    private ScanAccount account(Authentication authentication) {
        return accountRepository.findByUsernameIgnoreCase(authentication.getName())
            .orElseThrow(() -> new IllegalArgumentException("Unknown account"));
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

    public record AnalyticsContextResponse(List<RetailerAccessResponse> retailers, String commercialRole) {
    }

    public record RetailerAccessResponse(String code, String name, boolean demoData) {
    }

    public record SetCommercialRoleRequest(@NotBlank String commercialRole) {
    }
}
