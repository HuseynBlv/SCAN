package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "canonical_product")
public class CanonicalProduct {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "normalized_name", nullable = false)
    private String normalizedName;

    @Column(unique = true, length = 64)
    private String barcode;

    private String brand;
    private String manufacturer;

    @Column(length = 128)
    private String category;

    @Column(length = 128)
    private String subcategory;

    @Column(name = "package_size", length = 64)
    private String packageSize;

    @Column(name = "package_type", length = 64)
    private String packageType;

    @Column(name = "is_cci", nullable = false)
    private boolean cci;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected CanonicalProduct() {
    }

    public CanonicalProduct(
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
        this.normalizedName = normalizedName;
        this.barcode = barcode;
        this.brand = brand;
        this.manufacturer = manufacturer;
        this.category = category;
        this.subcategory = subcategory;
        this.packageSize = packageSize;
        this.packageType = packageType;
        this.cci = cci;
    }

    public UUID getId() {
        return id;
    }

    public String getNormalizedName() {
        return normalizedName;
    }

    public String getBarcode() {
        return barcode;
    }

    public String getBrand() {
        return brand;
    }

    public String getManufacturer() {
        return manufacturer;
    }

    public String getCategory() {
        return category;
    }

    public String getSubcategory() {
        return subcategory;
    }

    public String getPackageSize() {
        return packageSize;
    }

    public String getPackageType() {
        return packageType;
    }

    public boolean isCci() {
        return cci;
    }
}
