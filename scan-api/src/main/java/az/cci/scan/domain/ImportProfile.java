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
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(
    name = "import_profile",
    uniqueConstraints = @UniqueConstraint(
        name = "import_profile_retailer_code_key",
        columnNames = {"retailer_id", "code"}
    )
)
public class ImportProfile {

    public enum ValidationStatus {
        DRAFT,
        VALIDATED
    }

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_id", nullable = false)
    private Retailer retailer;

    @Column(nullable = false, length = 64)
    private String code;

    @Column(name = "source_system", nullable = false, length = 128)
    private String sourceSystem;

    @Column(name = "display_name", nullable = false, length = 128)
    private String displayName;

    @Column(nullable = false, length = 1)
    private String delimiter = ",";

    @Column(name = "date_time_pattern", nullable = false, length = 128)
    private String dateTimePattern;

    @Column(name = "zone_id", nullable = false, length = 64)
    private String zoneId;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "store_id_column", nullable = false, length = 128)
    private String storeIdColumn;

    @Column(name = "receipt_id_column", nullable = false, length = 128)
    private String receiptIdColumn;

    @Column(name = "timestamp_column", nullable = false, length = 128)
    private String timestampColumn;

    @Column(name = "product_code_column", length = 128)
    private String productCodeColumn;

    @Column(name = "barcode_column", length = 128)
    private String barcodeColumn;

    @Column(name = "product_name_column", nullable = false, length = 128)
    private String productNameColumn;

    @Column(name = "quantity_column", nullable = false, length = 128)
    private String quantityColumn;

    @Column(name = "unit_price_column", nullable = false, length = 128)
    private String unitPriceColumn;

    @Column(name = "discount_amount_column", nullable = false, length = 128)
    private String discountAmountColumn;

    @Column(name = "line_total_column", nullable = false, length = 128)
    private String lineTotalColumn;

    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    @Column(name = "validation_status", nullable = false, length = 32)
    private ValidationStatus validationStatus = ValidationStatus.VALIDATED;

    @Column(name = "validated_at")
    private Instant validatedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected ImportProfile() {
    }

    public ImportProfile(
        Retailer retailer,
        String code,
        String sourceSystem,
        String dateTimePattern,
        String zoneId,
        String currency
    ) {
        this.retailer = retailer;
        this.code = code;
        this.sourceSystem = sourceSystem;
        this.displayName = sourceSystem;
        this.dateTimePattern = dateTimePattern;
        this.zoneId = zoneId;
        this.currency = currency;
        this.storeIdColumn = "store_id";
        this.receiptIdColumn = "receipt_id";
        this.timestampColumn = "transaction_timestamp";
        this.productCodeColumn = "product_code";
        this.barcodeColumn = "barcode";
        this.productNameColumn = "product_name";
        this.quantityColumn = "quantity";
        this.unitPriceColumn = "unit_price";
        this.discountAmountColumn = "discount_amount";
        this.lineTotalColumn = "line_total";
        this.validationStatus = ValidationStatus.VALIDATED;
        this.validatedAt = Instant.now();
    }

    public static ImportProfile draft(
        Retailer retailer,
        String code,
        String displayName,
        String sourceSystem,
        char delimiter,
        String dateTimePattern,
        String zoneId,
        String currency,
        String storeIdColumn,
        String receiptIdColumn,
        String timestampColumn,
        String productCodeColumn,
        String barcodeColumn,
        String productNameColumn,
        String quantityColumn,
        String unitPriceColumn,
        String discountAmountColumn,
        String lineTotalColumn
    ) {
        ImportProfile profile = new ImportProfile(
            retailer,
            code,
            sourceSystem,
            dateTimePattern,
            zoneId,
            currency
        );
        profile.displayName = displayName;
        profile.delimiter = String.valueOf(delimiter);
        profile.storeIdColumn = storeIdColumn;
        profile.receiptIdColumn = receiptIdColumn;
        profile.timestampColumn = timestampColumn;
        profile.productCodeColumn = productCodeColumn;
        profile.barcodeColumn = barcodeColumn;
        profile.productNameColumn = productNameColumn;
        profile.quantityColumn = quantityColumn;
        profile.unitPriceColumn = unitPriceColumn;
        profile.discountAmountColumn = discountAmountColumn;
        profile.lineTotalColumn = lineTotalColumn;
        profile.validationStatus = ValidationStatus.DRAFT;
        profile.validatedAt = null;
        return profile;
    }

    public UUID getId() {
        return id;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public String getCode() {
        return code;
    }

    public String getSourceSystem() {
        return sourceSystem;
    }

    public String getDisplayName() {
        return displayName;
    }

    public char delimiterCharacter() {
        return delimiter.charAt(0);
    }

    public String getDateTimePattern() {
        return dateTimePattern;
    }

    public String getZoneId() {
        return zoneId;
    }

    public String getCurrency() {
        return currency;
    }

    public String getStoreIdColumn() {
        return storeIdColumn;
    }

    public String getReceiptIdColumn() {
        return receiptIdColumn;
    }

    public String getTimestampColumn() {
        return timestampColumn;
    }

    public String getProductCodeColumn() {
        return productCodeColumn;
    }

    public String getBarcodeColumn() {
        return barcodeColumn;
    }

    public String getProductNameColumn() {
        return productNameColumn;
    }

    public String getQuantityColumn() {
        return quantityColumn;
    }

    public String getUnitPriceColumn() {
        return unitPriceColumn;
    }

    public String getDiscountAmountColumn() {
        return discountAmountColumn;
    }

    public String getLineTotalColumn() {
        return lineTotalColumn;
    }

    public ValidationStatus getValidationStatus() {
        return validationStatus;
    }

    public Instant getValidatedAt() {
        return validatedAt;
    }

    public boolean isValidated() {
        return validationStatus == ValidationStatus.VALIDATED;
    }

    public void markValidated() {
        validationStatus = ValidationStatus.VALIDATED;
        validatedAt = Instant.now();
    }

    public void updateMapping(
        char delimiter,
        String dateTimePattern,
        String storeIdColumn,
        String receiptIdColumn,
        String timestampColumn,
        String productCodeColumn,
        String barcodeColumn,
        String productNameColumn,
        String quantityColumn,
        String unitPriceColumn,
        String discountAmountColumn,
        String lineTotalColumn
    ) {
        this.delimiter = String.valueOf(delimiter);
        this.dateTimePattern = dateTimePattern;
        this.storeIdColumn = storeIdColumn;
        this.receiptIdColumn = receiptIdColumn;
        this.timestampColumn = timestampColumn;
        this.productCodeColumn = productCodeColumn;
        this.barcodeColumn = barcodeColumn;
        this.productNameColumn = productNameColumn;
        this.quantityColumn = quantityColumn;
        this.unitPriceColumn = unitPriceColumn;
        this.discountAmountColumn = discountAmountColumn;
        this.lineTotalColumn = lineTotalColumn;
        validationStatus = ValidationStatus.DRAFT;
        validatedAt = null;
    }

    public Set<String> requiredColumns() {
        Set<String> columns = new LinkedHashSet<>();
        columns.add(storeIdColumn);
        columns.add(receiptIdColumn);
        columns.add(timestampColumn);
        columns.add(productNameColumn);
        columns.add(quantityColumn);
        columns.add(unitPriceColumn);
        columns.add(discountAmountColumn);
        columns.add(lineTotalColumn);
        return columns;
    }
}
