package az.cci.scan.retailer;

import az.cci.scan.config.TenantAccessService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/retailer/opportunities")
public class RetailerOpportunityController {
    private final RetailerOpportunityService service;
    private final TenantAccessService tenantAccess;

    public RetailerOpportunityController(RetailerOpportunityService service, TenantAccessService tenantAccess) {
        this.service = service;
        this.tenantAccess = tenantAccess;
    }

    @GetMapping
    public RetailerOpportunityDtos.Response opportunities(Authentication authentication) {
        return service.opportunities(tenantAccess.retailer(authentication));
    }

    @PostMapping("/{opportunityId}/trials")
    @ResponseStatus(HttpStatus.CREATED)
    public RetailerOpportunityDtos.Opportunity startTrial(
        @PathVariable String opportunityId,
        @Valid @RequestBody RetailerOpportunityDtos.StartTrialRequest request,
        Authentication authentication
    ) {
        return service.startTrial(tenantAccess.retailer(authentication), opportunityId,
            request.startDate(), request.durationDays(), authentication.getName());
    }
}
