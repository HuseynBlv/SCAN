package az.cci.scan.domain;

import az.cci.scan.importing.IngestionAnalysis;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Entity
@Table(name = "import_preview")
public class ImportPreview {

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_id", nullable = false)
    private Retailer retailer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "import_profile_id", nullable = false)
    private ImportProfile importProfile;

    @Column(name = "original_filename", nullable = false, length = 512)
    private String originalFilename;

    @Column(name = "file_sha256", nullable = false, length = 64)
    private String fileSha256;

    @Column(name = "adapter_code", nullable = false, length = 64)
    private String adapterCode;

    @Column(name = "source_rows", nullable = false)
    private int sourceRows;

    @Column(name = "receipts_detected", nullable = false)
    private int receiptsDetected;

    @Column(name = "product_lines", nullable = false)
    private int productLines;

    @Column(name = "distinct_products", nullable = false)
    private int distinctProducts;

    @Column(name = "quantity_total", nullable = false, precision = 19, scale = 4)
    private BigDecimal quantityTotal;

    @Column(name = "gross_sales", nullable = false, precision = 19, scale = 4)
    private BigDecimal grossSales;

    @Column(name = "discount_total", nullable = false, precision = 19, scale = 4)
    private BigDecimal discountTotal;

    @Column(name = "reported_net_sales", nullable = false, precision = 19, scale = 4)
    private BigDecimal reportedNetSales;

    @Column(name = "calculated_net_sales", nullable = false, precision = 19, scale = 4)
    private BigDecimal calculatedNetSales;

    @Column(name = "reconciliation_difference", nullable = false, precision = 19, scale = 4)
    private BigDecimal reconciliationDifference;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "consumed_at")
    private Instant consumedAt;

    protected ImportPreview() {
    }

    public ImportPreview(
        Retailer retailer,
        ImportProfile importProfile,
        String originalFilename,
        String fileSha256,
        IngestionAnalysis analysis
    ) {
        IngestionAnalysis.Reconciliation totals = analysis.reconciliation();
        this.retailer = retailer;
        this.importProfile = importProfile;
        this.originalFilename = originalFilename;
        this.fileSha256 = fileSha256;
        this.adapterCode = analysis.adapterCode();
        this.sourceRows = analysis.sourceRows();
        this.receiptsDetected = totals.receipts();
        this.productLines = totals.productLines();
        this.distinctProducts = totals.distinctProducts();
        this.quantityTotal = totals.quantity();
        this.grossSales = totals.grossSales();
        this.discountTotal = totals.discounts();
        this.reportedNetSales = totals.reportedNetSales();
        this.calculatedNetSales = totals.calculatedNetSales();
        this.reconciliationDifference = totals.difference();
        this.expiresAt = createdAt.plus(30, ChronoUnit.MINUTES);
    }

    public void assertUsable(
        Retailer expectedRetailer,
        ImportProfile expectedProfile,
        String expectedHash,
        IngestionAnalysis analysis
    ) {
        if (!retailer.getId().equals(expectedRetailer.getId())
            || !importProfile.getId().equals(expectedProfile.getId())) {
            throw new IllegalArgumentException("Import preview does not belong to this retailer and format");
        }
        if (consumedAt != null) {
            throw new IllegalArgumentException("Import preview has already been used");
        }
        if (expiresAt.isBefore(Instant.now())) {
            throw new IllegalArgumentException("Import preview has expired; validate the file again");
        }
        if (!fileSha256.equals(expectedHash)) {
            throw new IllegalArgumentException("Selected file changed after reconciliation; validate it again");
        }
        IngestionAnalysis.Reconciliation totals = analysis.reconciliation();
        if (!adapterCode.equals(analysis.adapterCode())
            || sourceRows != analysis.sourceRows()
            || receiptsDetected != totals.receipts()
            || productLines != totals.productLines()
            || distinctProducts != totals.distinctProducts()
            || quantityTotal.compareTo(totals.quantity()) != 0
            || grossSales.compareTo(totals.grossSales()) != 0
            || discountTotal.compareTo(totals.discounts()) != 0
            || reportedNetSales.compareTo(totals.reportedNetSales()) != 0
            || calculatedNetSales.compareTo(totals.calculatedNetSales()) != 0
            || reconciliationDifference.compareTo(totals.difference()) != 0) {
            throw new IllegalArgumentException("Reconciliation changed; validate the file again");
        }
    }

    public void consume() {
        consumedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public ImportProfile getImportProfile() {
        return importProfile;
    }

    public String getAdapterCode() {
        return adapterCode;
    }

    public int getSourceRows() {
        return sourceRows;
    }

    public int getReceiptsDetected() {
        return receiptsDetected;
    }

    public int getProductLines() {
        return productLines;
    }

    public int getDistinctProducts() {
        return distinctProducts;
    }

    public BigDecimal getQuantityTotal() {
        return quantityTotal;
    }

    public BigDecimal getGrossSales() {
        return grossSales;
    }

    public BigDecimal getDiscountTotal() {
        return discountTotal;
    }

    public BigDecimal getReportedNetSales() {
        return reportedNetSales;
    }

    public BigDecimal getCalculatedNetSales() {
        return calculatedNetSales;
    }

    public BigDecimal getReconciliationDifference() {
        return reconciliationDifference;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }
}
