package az.cci.scan.catalog;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

import static az.cci.scan.catalog.ProductMappingDtos.CanonicalProductResponse;
import static az.cci.scan.catalog.ProductMappingDtos.CreateCanonicalProductRequest;
import static az.cci.scan.catalog.ProductMappingDtos.ManualMappingRequest;
import static az.cci.scan.catalog.ProductMappingDtos.RetailerProductResponse;

@RestController
@RequestMapping("/api/v1/product-mappings")
public class ProductMappingController {

    private final ProductMappingService productMappingService;

    public ProductMappingController(ProductMappingService productMappingService) {
        this.productMappingService = productMappingService;
    }

    @GetMapping("/unresolved")
    public List<RetailerProductResponse> unresolved(@RequestParam String retailerCode) {
        return productMappingService.unresolved(retailerCode);
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

    @PutMapping("/{retailerProductId}")
    public RetailerProductResponse map(
        @PathVariable UUID retailerProductId,
        @Valid @RequestBody ManualMappingRequest request
    ) {
        return productMappingService.map(retailerProductId, request.canonicalProductId());
    }
}
