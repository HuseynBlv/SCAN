package az.cci.scan.catalog;

import az.cci.scan.config.TenantAccessService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

import static az.cci.scan.catalog.ProductMappingDtos.CanonicalProductResponse;
import static az.cci.scan.catalog.ProductMappingDtos.CatalogImportResponse;
import static az.cci.scan.catalog.ProductMappingDtos.CreateCanonicalProductRequest;
import static az.cci.scan.catalog.ProductMappingDtos.ManualMappingRequest;
import static az.cci.scan.catalog.ProductMappingDtos.RetailerProductResponse;

@RestController
@RequestMapping("/api/v1/product-mappings")
public class ProductMappingController {

    private final ProductMappingService productMappingService;
    private final ProductCatalogImportService productCatalogImportService;
    private final TenantAccessService tenantAccess;

    public ProductMappingController(
        ProductMappingService productMappingService,
        ProductCatalogImportService productCatalogImportService,
        TenantAccessService tenantAccess
    ) {
        this.productMappingService = productMappingService;
        this.productCatalogImportService = productCatalogImportService;
        this.tenantAccess = tenantAccess;
    }

    @GetMapping("/unresolved")
    public List<RetailerProductResponse> unresolved(Authentication authentication) {
        return productMappingService.unresolved(tenantAccess.retailer(authentication));
    }

    @GetMapping("/catalog")
    public List<CanonicalProductResponse> catalog() {
        return productMappingService.catalog();
    }

    @PostMapping("/catalog")
    @ResponseStatus(HttpStatus.CREATED)
    public CanonicalProductResponse createCanonical(
        @Valid @RequestBody CreateCanonicalProductRequest request
    ) {
        return productMappingService.createCanonical(request);
    }

    @PostMapping(path = "/catalog-imports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public CatalogImportResponse importCatalog(
        @RequestPart("file") MultipartFile file,
        Authentication authentication
    ) {
        return productCatalogImportService.importCatalog(
            tenantAccess.retailer(authentication),
            file
        );
    }

    @PutMapping("/{retailerProductId}")
    public RetailerProductResponse map(
        @PathVariable UUID retailerProductId,
        @Valid @RequestBody ManualMappingRequest request,
        Authentication authentication
    ) {
        return productMappingService.map(
            tenantAccess.retailer(authentication),
            retailerProductId,
            request.canonicalProductId()
        );
    }
}
