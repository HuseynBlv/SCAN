package az.cci.scan.catalog;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.RetailerProduct;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public final class ProductMappingDtos {

    private ProductMappingDtos() {
    }

    public record CreateCanonicalProductRequest(
        @NotBlank String normalizedName,
        String barcode,
        String brand,
        String manufacturer,
        String category,
        String subcategory,
        String packageSize,
        String packageType,
        boolean cci
    ) {
    }

    // Barcode is deliberately not editable here - it is the product's identity key. Correcting a
    // wrong barcode is a re-mapping decision, not a description edit.
    public record EditCanonicalProductRequest(
        @NotBlank String normalizedName,
        String brand,
        String manufacturer,
        String category,
        String subcategory,
        String packageSize,
        String packageType,
        boolean cci
    ) {
    }

    public record ManualMappingRequest(@NotNull UUID canonicalProductId) {
    }

    public record CatalogImportResponse(
        int rows,
        int createdCanonicalProducts,
        int existingCanonicalProducts,
        int createdRetailerProducts,
        int createdMappings,
        int existingMappings
    ) {
    }

    public record CanonicalProductResponse(
        UUID id,
        String normalizedName,
        String barcode,
        String brand,
        String manufacturer,
        String category,
        String subcategory,
        String packageSize,
        String packageType,
        boolean cci
    ) {
        static CanonicalProductResponse from(CanonicalProduct product) {
            return new CanonicalProductResponse(
                product.getId(),
                product.getNormalizedName(),
                product.getBarcode(),
                product.getBrand(),
                product.getManufacturer(),
                product.getCategory(),
                product.getSubcategory(),
                product.getPackageSize(),
                product.getPackageType(),
                product.isCci()
            );
        }
    }

    public record RetailerProductResponse(
        UUID id,
        String retailerCode,
        String productCode,
        String barcode,
        String originalProductName,
        String originalCategory,
        String matchMethod,
        CanonicalProductResponse canonicalProduct
    ) {
        static RetailerProductResponse from(RetailerProduct product) {
            return new RetailerProductResponse(
                product.getId(),
                product.getRetailer().getCode(),
                product.getSourceProductCode(),
                product.getBarcode(),
                product.getOriginalProductName(),
                product.getOriginalCategory(),
                product.getMatchMethod().name(),
                product.getCanonicalProduct() == null
                    ? null
                    : CanonicalProductResponse.from(product.getCanonicalProduct())
            );
        }
    }
}
