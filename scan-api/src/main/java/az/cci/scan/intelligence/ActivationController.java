package az.cci.scan.intelligence;

import az.cci.scan.config.TenantAccessService;
import az.cci.scan.domain.Activation;
import az.cci.scan.domain.Retailer;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static az.cci.scan.intelligence.ActivationDtos.ActivationResponse;
import static az.cci.scan.intelligence.ActivationDtos.CreateActivationRequest;

/**
 * Test-vs-control activations for Trade Marketing and Sales - see ActivationService for how the
 * before/during, test-vs-control comparison is computed and why its language never claims causation.
 */
@RestController
@RequestMapping("/api/v1/activations")
public class ActivationController {

    private final ActivationService activationService;
    private final TenantAccessService tenantAccess;

    public ActivationController(ActivationService activationService, TenantAccessService tenantAccess) {
        this.activationService = activationService;
        this.tenantAccess = tenantAccess;
    }

    @GetMapping
    public List<ActivationResponse> list(@RequestParam String retailerCode, Authentication authentication) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        Instant now = Instant.now();
        return activationService.list(retailer).stream()
            .map(activation -> ActivationResponse.from(activation, activationService.analyze(retailer, activation), now))
            .toList();
    }

    @GetMapping("/{activationId}")
    public ActivationResponse get(
        @PathVariable UUID activationId,
        @RequestParam String retailerCode,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        Activation activation = activationService.get(retailer, activationId);
        return ActivationResponse.from(activation, activationService.analyze(retailer, activation), Instant.now());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ActivationResponse create(
        @RequestParam String retailerCode,
        @Valid @RequestBody CreateActivationRequest request,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        Activation.PrimaryMetric primaryMetric = Activation.PrimaryMetric.valueOf(request.primaryMetric().toUpperCase(Locale.ROOT));
        Activation activation = activationService.create(
            retailer, request.name(), request.objective(), request.hypothesis(), request.productName(),
            primaryMetric, request.startDate(), request.endDate(), request.testStoreIds(), request.controlStoreIds(),
            authentication.getName()
        );
        return ActivationResponse.from(activation, activationService.analyze(retailer, activation), Instant.now());
    }
}
