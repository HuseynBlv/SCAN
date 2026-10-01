package az.cci.scan.intelligence;

import az.cci.scan.config.TenantAccessService;
import az.cci.scan.domain.InvestigationHypothesis;
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

import java.util.List;
import java.util.UUID;

import static az.cci.scan.intelligence.InvestigationDtos.AddHypothesisRequest;
import static az.cci.scan.intelligence.InvestigationDtos.AddNoteRequest;
import static az.cci.scan.intelligence.InvestigationDtos.InvestigationResponse;
import static az.cci.scan.intelligence.InvestigationDtos.OpenGeneralInvestigationRequest;
import static az.cci.scan.intelligence.InvestigationDtos.OpenProductInvestigationRequest;

/**
 * The "Investigate" surface: open an investigation against a real product comparison or a manual
 * question, then accumulate notes, hypotheses, and status as evidence comes in. Every endpoint is
 * tenant-scoped the same way AnalyticsController is - a CCI account only ever sees the one
 * retailer named in {@code retailerCode}, and only if that account was granted access to it.
 */
@RestController
@RequestMapping("/api/v1/investigations")
public class InvestigationController {

    private static final int DEFAULT_PERIOD_DAYS = 14;

    private final InvestigationService investigationService;
    private final TenantAccessService tenantAccess;

    public InvestigationController(InvestigationService investigationService, TenantAccessService tenantAccess) {
        this.investigationService = investigationService;
        this.tenantAccess = tenantAccess;
    }

    @GetMapping
    public List<InvestigationResponse> list(
        @RequestParam String retailerCode,
        @RequestParam(defaultValue = "false") boolean openOnly,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return investigationService.list(retailer, openOnly).stream().map(InvestigationResponse::from).toList();
    }

    @GetMapping("/{investigationId}")
    public InvestigationResponse get(
        @PathVariable UUID investigationId,
        @RequestParam String retailerCode,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return InvestigationResponse.from(investigationService.get(retailer, investigationId));
    }

    @PostMapping("/product")
    @ResponseStatus(HttpStatus.CREATED)
    public InvestigationResponse openForProduct(
        @RequestParam String retailerCode,
        @Valid @RequestBody OpenProductInvestigationRequest request,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        int periodDays = request.periodDays() == null ? DEFAULT_PERIOD_DAYS : request.periodDays();
        return InvestigationResponse.from(
            investigationService.openForProduct(retailer, request.productName(), periodDays, authentication.getName())
        );
    }

    @PostMapping("/general")
    @ResponseStatus(HttpStatus.CREATED)
    public InvestigationResponse openGeneral(
        @RequestParam String retailerCode,
        @Valid @RequestBody OpenGeneralInvestigationRequest request,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return InvestigationResponse.from(
            investigationService.openGeneral(retailer, request.title(), request.question(), authentication.getName())
        );
    }

    @PostMapping("/{investigationId}/notes")
    public InvestigationResponse addNote(
        @PathVariable UUID investigationId,
        @RequestParam String retailerCode,
        @Valid @RequestBody AddNoteRequest request,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return InvestigationResponse.from(
            investigationService.addNote(retailer, investigationId, authentication.getName(), request.body())
        );
    }

    @PostMapping("/{investigationId}/hypotheses")
    @ResponseStatus(HttpStatus.CREATED)
    public InvestigationResponse addHypothesis(
        @PathVariable UUID investigationId,
        @RequestParam String retailerCode,
        @Valid @RequestBody AddHypothesisRequest request,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        InvestigationHypothesis.Confidence confidence =
            InvestigationHypothesis.Confidence.valueOf(request.confidence().toUpperCase());
        return InvestigationResponse.from(investigationService.addHypothesis(
            retailer, investigationId, request.statement(), request.supportingEvidence(),
            request.contradictingEvidence(), confidence
        ));
    }

    @PostMapping("/{investigationId}/hypotheses/{hypothesisId}/confirm")
    public InvestigationResponse confirmHypothesis(
        @PathVariable UUID investigationId,
        @PathVariable UUID hypothesisId,
        @RequestParam String retailerCode,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return InvestigationResponse.from(investigationService.setHypothesisStatus(
            retailer, investigationId, hypothesisId, InvestigationHypothesis.Status.CONFIRMED
        ));
    }

    @PostMapping("/{investigationId}/hypotheses/{hypothesisId}/reject")
    public InvestigationResponse rejectHypothesis(
        @PathVariable UUID investigationId,
        @PathVariable UUID hypothesisId,
        @RequestParam String retailerCode,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return InvestigationResponse.from(investigationService.setHypothesisStatus(
            retailer, investigationId, hypothesisId, InvestigationHypothesis.Status.REJECTED
        ));
    }

    @PostMapping("/{investigationId}/close")
    public InvestigationResponse close(
        @PathVariable UUID investigationId,
        @RequestParam String retailerCode,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return InvestigationResponse.from(investigationService.close(retailer, investigationId));
    }

    @PostMapping("/{investigationId}/reopen")
    public InvestigationResponse reopen(
        @PathVariable UUID investigationId,
        @RequestParam String retailerCode,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return InvestigationResponse.from(investigationService.reopen(retailer, investigationId));
    }
}
