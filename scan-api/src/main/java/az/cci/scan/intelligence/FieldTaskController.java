package az.cci.scan.intelligence;

import az.cci.scan.config.TenantAccessService;
import az.cci.scan.domain.FieldTask;
import az.cci.scan.domain.Investigation;
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

import static az.cci.scan.intelligence.FieldTaskDtos.CreateFieldTaskRequest;
import static az.cci.scan.intelligence.FieldTaskDtos.FieldTaskResponse;
import static az.cci.scan.intelligence.FieldTaskDtos.RecordResultRequest;

/**
 * The "Create field check" / "field task" surface: a real, assignable request to check named
 * stores, and the endpoint a completed checklist reports back through - which is what lets a
 * field visit strengthen an investigation's evidence instead of living in a separate silo.
 */
@RestController
@RequestMapping("/api/v1/field-tasks")
public class FieldTaskController {

    private final FieldTaskService fieldTaskService;
    private final InvestigationService investigationService;
    private final TenantAccessService tenantAccess;

    public FieldTaskController(
        FieldTaskService fieldTaskService,
        InvestigationService investigationService,
        TenantAccessService tenantAccess
    ) {
        this.fieldTaskService = fieldTaskService;
        this.investigationService = investigationService;
        this.tenantAccess = tenantAccess;
    }

    @GetMapping
    public List<FieldTaskResponse> list(@RequestParam String retailerCode, Authentication authentication) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return fieldTaskService.list(retailer).stream().map(FieldTaskResponse::from).toList();
    }

    @GetMapping("/{taskId}")
    public FieldTaskResponse get(
        @PathVariable UUID taskId,
        @RequestParam String retailerCode,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return FieldTaskResponse.from(fieldTaskService.get(retailer, taskId));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FieldTaskResponse create(
        @RequestParam String retailerCode,
        @Valid @RequestBody CreateFieldTaskRequest request,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        Investigation investigation = request.investigationId() == null
            ? null
            : investigationService.get(retailer, request.investigationId());
        return FieldTaskResponse.from(fieldTaskService.create(
            retailer, investigation, request.title(), request.reason(), request.assignedTo(),
            request.dueAt(), request.storeIds(), authentication.getName()
        ));
    }

    @PostMapping("/{taskId}/results/{externalStoreId}")
    public FieldTaskResponse recordResult(
        @PathVariable UUID taskId,
        @PathVariable String externalStoreId,
        @RequestParam String retailerCode,
        @Valid @RequestBody RecordResultRequest request,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        FieldTask task = fieldTaskService.recordResult(
            retailer, taskId, externalStoreId, request.stockAvailable(), request.visibleInCooler(),
            request.correctPlacement(), request.competitorPresent(), request.note()
        );
        return FieldTaskResponse.from(task);
    }
}
