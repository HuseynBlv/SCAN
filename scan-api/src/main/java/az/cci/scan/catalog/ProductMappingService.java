package az.cci.scan.catalog;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.RetailerProduct;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static az.cci.scan.catalog.ProductMappingDtos.CanonicalProductResponse;
import static az.cci.scan.catalog.ProductMappingDtos.CreateCanonicalProductRequest;
import static az.cci.scan.catalog.ProductMappingDtos.RetailerProductResponse;

@Service
public class ProductMappingService {

    private final RetailerRepository retailerRepository;
    private final RetailerProductRepository retailerProductRepository;
    private final CanonicalProductRepository canonicalProductRepository;

    public ProductMappingService(
        RetailerRepository retailerRepository,
        RetailerProductRepository retailerProductRepository,
        CanonicalProductRepository canonicalProductRepository
    ) {
        this.retailerRepository = retailerRepository;
        this.retailerProductRepository = retailerProductRepository;
        this.canonicalProductRepository = canonicalProductRepository;
    }

    @Transactional(readOnly = true)
    public List<RetailerProductResponse> unresolved(String retailerCode) {
        Retailer retailer = retailer(retailerCode);
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

    @Transactional
    public RetailerProductResponse map(UUID retailerProductId, UUID canonicalProductId) {
        RetailerProduct retailerProduct = retailerProductRepository.findById(retailerProductId)
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
