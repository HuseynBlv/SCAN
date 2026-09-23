package az.cci.scan.catalog;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.RetailerProduct;
import az.cci.scan.operations.AuditService;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static az.cci.scan.catalog.ProductMappingDtos.CanonicalProductResponse;
import static az.cci.scan.catalog.ProductMappingDtos.CreateCanonicalProductRequest;
import static az.cci.scan.catalog.ProductMappingDtos.EditCanonicalProductRequest;
import static az.cci.scan.catalog.ProductMappingDtos.RetailerProductResponse;

@Service
public class ProductMappingService {

    private final RetailerRepository retailerRepository;
    private final RetailerProductRepository retailerProductRepository;
    private final CanonicalProductRepository canonicalProductRepository;
    private final AuditService auditService;

    public ProductMappingService(
        RetailerRepository retailerRepository,
        RetailerProductRepository retailerProductRepository,
        CanonicalProductRepository canonicalProductRepository,
        AuditService auditService
    ) {
        this.retailerRepository = retailerRepository;
        this.retailerProductRepository = retailerProductRepository;
        this.canonicalProductRepository = canonicalProductRepository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<RetailerProductResponse> unresolved(String retailerCode) {
        Retailer retailer = retailer(retailerCode);
        return unresolved(retailer);
    }

    @Transactional(readOnly = true)
    public List<RetailerProductResponse> unresolved(Retailer retailer) {
        return retailerProductRepository
            .findAllByRetailerAndCanonicalProductIsNullOrderByOriginalProductNameAsc(retailer)
            .stream()
            .map(RetailerProductResponse::from)
            .toList();
    }

    @Transactional(readOnly = true)
    public List<CanonicalProductResponse> catalog() {
        return canonicalProductRepository.findAllByOrderByNormalizedNameAsc()
            .stream()
            .map(CanonicalProductResponse::from)
            .toList();
    }

    @Transactional
    public CanonicalProductResponse createCanonical(CreateCanonicalProductRequest request) {
        CanonicalProduct product = canonicalProductRepository.save(new CanonicalProduct(
            request.normalizedName().trim(),
            blankToNull(request.barcode()),
            blankToNull(request.brand()),
            blankToNull(request.manufacturer()),
            blankToNull(request.category()),
            blankToNull(request.subcategory()),
            blankToNull(request.packageSize()),
            blankToNull(request.packageType()),
            request.cci()
        ));
        return CanonicalProductResponse.from(product);
    }

    /**
     * Corrects an existing catalog entry - most importantly, one an external barcode lookup
     * auto-created with a crowd-sourced name in the wrong language. There was no way to do this
     * before; every canonical product was write-once. The normalized-key collision is checked
     * explicitly rather than caught after a failed save, same reasoning as the external-lookup
     * auto-creation path: a caught constraint violation risks the persistence context mid-request.
     */
    @Transactional
    public CanonicalProductResponse editCanonical(
        UUID canonicalProductId,
        EditCanonicalProductRequest request,
        Authentication authentication
    ) {
        CanonicalProduct product = canonicalProductRepository.findById(canonicalProductId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown SCAN product: " + canonicalProductId));
        String newName = request.normalizedName().trim();
        String newKey = CanonicalProduct.normalizedKey(newName);
        if (!newKey.equals(product.getNormalizedKey())) {
            boolean collision = canonicalProductRepository.findAllByNormalizedKeyIn(List.of(newKey)).stream()
                .anyMatch(existing -> !existing.getId().equals(canonicalProductId));
            if (collision) {
                throw new IllegalArgumentException(
                    "Another SCAN product is already named \"" + newName + "\""
                );
            }
        }
        String previousName = product.getNormalizedName();
        product.edit(
            newName,
            blankToNull(request.brand()),
            blankToNull(request.manufacturer()),
            blankToNull(request.category()),
            blankToNull(request.subcategory()),
            blankToNull(request.packageSize()),
            blankToNull(request.packageType()),
            request.cci()
        );
        canonicalProductRepository.save(product);
        auditService.record(
            null, authentication, "CANONICAL_PRODUCT_EDITED", "CANONICAL_PRODUCT",
            canonicalProductId.toString(),
            previousName.equals(newName)
                ? "Updated catalog details for \"" + newName + "\""
                : "Renamed \"" + previousName + "\" to \"" + newName + "\""
        );
        return CanonicalProductResponse.from(product);
    }

    @Transactional
    public RetailerProductResponse map(UUID retailerProductId, UUID canonicalProductId) {
        RetailerProduct retailerProduct = retailerProductRepository.findById(retailerProductId)
            .orElseThrow(() -> new IllegalArgumentException(
                "Unknown retailer product: " + retailerProductId
            ));
        return map(retailerProduct.getRetailer(), retailerProductId, canonicalProductId);
    }

    @Transactional
    public RetailerProductResponse map(
        Retailer retailer,
        UUID retailerProductId,
        UUID canonicalProductId
    ) {
        RetailerProduct retailerProduct = retailerProductRepository
            .findByIdAndRetailer(retailerProductId, retailer)
            .orElseThrow(() -> new IllegalArgumentException(
                "Unknown retailer product: " + retailerProductId
            ));
        CanonicalProduct canonicalProduct = canonicalProductRepository.findById(canonicalProductId)
            .orElseThrow(() -> new IllegalArgumentException(
                "Unknown canonical product: " + canonicalProductId
            ));
        retailerProduct.mapTo(canonicalProduct, RetailerProduct.MatchMethod.MANUAL);
        return RetailerProductResponse.from(retailerProductRepository.save(retailerProduct));
    }

    private Retailer retailer(String retailerCode) {
        return retailerRepository.findByCodeIgnoreCase(retailerCode)
            .orElseThrow(() -> new IllegalArgumentException("Unknown retailer: " + retailerCode));
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
