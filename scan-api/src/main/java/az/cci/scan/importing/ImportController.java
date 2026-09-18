package az.cci.scan.importing;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.config.TenantAccessService;
import org.springframework.security.core.Authentication;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;
import java.util.List;

import jakarta.validation.Valid;

import static az.cci.scan.importing.ImportDtos.ImportJobResponse;
import static az.cci.scan.importing.ImportDtos.ImportContextResponse;
import static az.cci.scan.importing.ImportDtos.ImportPreviewResponse;
import static az.cci.scan.importing.ImportDtos.UpdateImportMappingRequest;
import static az.cci.scan.importing.ImportDtos.AuditEventResponse;
import static az.cci.scan.importing.ImportDtos.ImportOperationsResponse;

@RestController
@RequestMapping("/api/v1/imports")
public class ImportController {

    private final ImportService importService;
    private final TenantAccessService tenantAccess;
    private final ImportOperationsService operationsService;

    public ImportController(
        ImportService importService,
        TenantAccessService tenantAccess,
        ImportOperationsService operationsService
    ) {
        this.importService = importService;
        this.tenantAccess = tenantAccess;
        this.operationsService = operationsService;
    }

    @GetMapping("/context")
    public ImportContextResponse context(Authentication authentication) {
        TenantAccessService.ImportScope scope = tenantAccess.importScope(authentication);
        return ImportContextResponse.from(scope.retailer(), scope.profile());
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ImportJobResponse> upload(
        @RequestPart("file") MultipartFile file,
        @RequestParam("previewId") UUID previewId,
        Authentication authentication
    ) {
        TenantAccessService.ImportScope scope = tenantAccess.importScope(authentication);
        ImportJobResponse response = importService.enqueuePreviewedFile(
            scope.retailer(), scope.profile(), previewId, file, authentication
        );
        return httpResponse(response);
    }

    @PostMapping(path = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImportPreviewResponse preview(
        @RequestPart("file") MultipartFile file,
        Authentication authentication
    ) {
        TenantAccessService.ImportScope scope = tenantAccess.importScope(authentication);
        return importService.preview(scope.retailer(), scope.profile(), file);
    }

    @PutMapping(path = "/profile", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ImportContextResponse updateProfile(
        @Valid @RequestBody UpdateImportMappingRequest request,
        Authentication authentication
    ) {
        TenantAccessService.ImportScope scope = tenantAccess.importScope(authentication);
        return importService.updateMapping(scope.retailer(), scope.profile(), request);
    }

    static ResponseEntity<ImportJobResponse> httpResponse(ImportJobResponse response) {
        if (response.duplicateFile()) {
            return ResponseEntity.ok(response);
        }
        if (response.status() == ImportJob.Status.FAILED) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_CONTENT).body(response);
        }
        if (response.status() == ImportJob.Status.RECEIVED
            || response.status() == ImportJob.Status.VALIDATING
            || response.status() == ImportJob.Status.IMPORTING) {
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{jobId}")
    public ImportJobResponse get(@PathVariable UUID jobId, Authentication authentication) {
        return importService.getJob(tenantAccess.retailer(authentication), jobId);
    }

    @GetMapping("/history")
    public List<ImportJobResponse> history(
        @RequestParam(defaultValue = "50") int limit,
        Authentication authentication
    ) {
        return operationsService.history(tenantAccess.retailer(authentication), limit);
    }

    @GetMapping("/audit")
    public List<AuditEventResponse> audit(
        @RequestParam(defaultValue = "50") int limit,
        Authentication authentication
    ) {
        return operationsService.audit(tenantAccess.retailer(authentication), limit);
    }

    @GetMapping("/operations")
    public ImportOperationsResponse operations(Authentication authentication) {
        return operationsService.operations(tenantAccess.retailer(authentication));
    }
}
