package az.cci.scan.retailer;

import az.cci.scan.config.TenantAccessService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static az.cci.scan.retailer.RetailerEngagementDtos.Action;
import static az.cci.scan.retailer.RetailerEngagementDtos.Offer;
import static az.cci.scan.retailer.RetailerEngagementDtos.OffersResponse;
import static az.cci.scan.retailer.RetailerEngagementDtos.PartnerStatusResponse;

/**
 * The retailer-facing "what do I get from SCAN" surface: commercial offers, recommended actions,
 * and Partner standing. Sits alongside RetailerAnalyticsController, which remains the source for
 * Store Insights (the retailer's own secondary analytics page).
 */
@RestController
@RequestMapping("/api/v1/retailer")
public class RetailerEngagementController {

    private final RetailerOfferCatalogService offerCatalogService;
    private final RetailerActionService actionService;
    private final RetailerPartnerStatusService partnerStatusService;
    private final TenantAccessService tenantAccess;

    public RetailerEngagementController(
        RetailerOfferCatalogService offerCatalogService,
        RetailerActionService actionService,
        RetailerPartnerStatusService partnerStatusService,
        TenantAccessService tenantAccess
    ) {
        this.offerCatalogService = offerCatalogService;
        this.actionService = actionService;
        this.partnerStatusService = partnerStatusService;
        this.tenantAccess = tenantAccess;
    }

    @GetMapping("/offers")
    public OffersResponse offers(Authentication authentication) {
        return offerCatalogService.offers(tenantAccess.retailer(authentication));
    }

    @PostMapping("/offers/{offerKey}/activate")
    public Offer activate(@PathVariable String offerKey, Authentication authentication) {
        return offerCatalogService.activate(tenantAccess.retailer(authentication), offerKey, authentication);
    }

    @GetMapping("/actions")
    public List<Action> actions(Authentication authentication) {
        return actionService.actions(tenantAccess.retailer(authentication));
    }

    @GetMapping("/partner-status")
    public PartnerStatusResponse partnerStatus(Authentication authentication) {
        return partnerStatusService.status(tenantAccess.retailer(authentication));
    }
}
