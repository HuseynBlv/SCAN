package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "transaction_line")
public class TransactionLine {

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receipt_id", nullable = false)
    private Receipt receipt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_product_id", nullable = false)
    private RetailerProduct retailerProduct;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_import_job_id", nullable = false)
    private ImportJob sourceImportJob;

    @Column(name = "source_row_number", nullable = false)
    private int sourceRowNumber;

    @Column(name = "product_code", length = 128)
    private String productCode;

    @Column(length = 64)
    private String barcode;

    @Column(name = "original_product_name", nullable = false, length = 512)
    private String originalProductName;

    @Column(nullable = false, precision = 19, scale = 4)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false, precision = 19, scale = 4)
    private BigDecimal unitPrice;

    @Column(name = "discount_amount", nullable = false, precision = 19, scale = 4)
    private BigDecimal discountAmount;

    @Column(name = "line_total", nullable = false, precision = 19, scale = 4)
    private BigDecimal lineTotal;

    @Column(name = "source_system", nullable = false, length = 128)
    private String sourceSystem;

    protected TransactionLine() {
    }

    public TransactionLine(
        Receipt receipt,
        RetailerProduct retailerProduct,
        ImportJob sourceImportJob,
        int sourceRowNumber,
        String productCode,
        String barcode,
        String originalProductName,
        BigDecimal quantity,
        BigDecimal unitPrice,
        BigDecimal discountAmount,
        BigDecimal lineTotal,
        String sourceSystem
    ) {
        this.receipt = receipt;
        this.retailerProduct = retailerProduct;
        this.sourceImportJob = sourceImportJob;
        this.sourceRowNumber = sourceRowNumber;
        this.productCode = productCode;
        this.barcode = barcode;
        this.originalProductName = originalProductName;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.discountAmount = discountAmount;
        this.lineTotal = lineTotal;
        this.sourceSystem = sourceSystem;
    }

    public UUID getId() {
        return id;
    }

    public Receipt getReceipt() {
        return receipt;
    }

    public RetailerProduct getRetailerProduct() {
        return retailerProduct;
    }

    public int getSourceRowNumber() {
        return sourceRowNumber;
    }

    public String getProductCode() {
        return productCode;
    }

    public String getBarcode() {
        return barcode;
    }

    public String getOriginalProductName() {
        return originalProductName;
    }

    public BigDecimal getQuantity() {
        return quantity;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public BigDecimal getDiscountAmount() {
        return discountAmount;
    }

    public BigDecimal getLineTotal() {
        return lineTotal;
    }
}
