package az.cci.scan.importing;

import az.cci.scan.config.TenantAccessService;
import org.springframework.security.core.Authentication;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import static az.cci.scan.importing.ImportDtos.ImportJobResponse;

@RestController
@RequestMapping("/api/v1/connector")
public class ConnectorImportController {

    private final ImportService importService;
    private final TenantAccessService tenantAccess;

    public ConnectorImportController(
        ImportService importService,
        TenantAccessService tenantAccess
    ) {
        this.importService = importService;
        this.tenantAccess = tenantAccess;
    }

    @PostMapping(path = "/imports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ImportJobResponse> upload(
        @RequestPart("file") MultipartFile file,
        Authentication authentication
    ) {
        TenantAccessService.ImportScope scope = tenantAccess.importScope(authentication);
        ImportJobResponse response = importService.enqueueFile(
            scope.retailer(), scope.profile(), file, authentication
        );
        return ImportController.httpResponse(response);
    }
}
