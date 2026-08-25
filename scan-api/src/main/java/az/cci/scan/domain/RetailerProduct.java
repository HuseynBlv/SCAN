package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
    name = "retailer_product",
    uniqueConstraints = @UniqueConstraint(
        name = "retailer_product_key",
        columnNames = {"retailer_id", "product_key"}
    )
)
public class RetailerProduct {

    public enum MatchMethod {
        EXACT_BARCODE,
        SAVED_MAPPING,
        MANUAL,
        UNRESOLVED
    }

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_id", nullable = false)
    private Retailer retailer;

    @Column(name = "product_key", nullable = false, length = 512)
    private String productKey;

    @Column(name = "source_product_code", length = 128)
    private String sourceProductCode;

    @Column(length = 64)
    private String barcode;

    @Column(name = "original_product_name", nullable = false, length = 512)
    private String originalProductName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "canonical_product_id")
    private CanonicalProduct canonicalProduct;

    @Column(name = "match_method", nullable = false, length = 32)
    private String matchMethod = MatchMethod.UNRESOLVED.name();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected RetailerProduct() {
    }

    public RetailerProduct(
        Retailer retailer,
        String productKey,
        String sourceProductCode,
        String barcode,
        String originalProductName
    ) {
        this.retailer = retailer;
        this.productKey = productKey;
        this.sourceProductCode = sourceProductCode;
        this.barcode = barcode;
        this.originalProductName = originalProductName;
    }

    public void mapTo(CanonicalProduct product, MatchMethod method) {
        this.canonicalProduct = product;
        this.matchMethod = method.name();
        this.updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public String getProductKey() {
        return productKey;
    }

    public String getSourceProductCode() {
        return sourceProductCode;
    }

    public String getBarcode() {
        return barcode;
    }

    public String getOriginalProductName() {
        return originalProductName;
    }

    public CanonicalProduct getCanonicalProduct() {
        return canonicalProduct;
    }

    public MatchMethod getMatchMethod() {
        return MatchMethod.valueOf(matchMethod);
    }

    public boolean isResolved() {
        return canonicalProduct != null;
    }
}
