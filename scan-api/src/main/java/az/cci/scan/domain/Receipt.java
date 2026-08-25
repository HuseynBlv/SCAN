package az.cci.scan.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Entity
@Table(
    name = "receipt",
    uniqueConstraints = @UniqueConstraint(
        name = "receipt_identity_key",
        columnNames = {
            "retailer_id",
            "store_id",
            "external_receipt_id",
            "transaction_timestamp"
        }
    )
)
public class Receipt {

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_id", nullable = false)
    private Retailer retailer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Column(name = "external_receipt_id", nullable = false, length = 256)
    private String externalReceiptId;

    @Column(name = "transaction_timestamp", nullable = false)
    private Instant transactionTimestamp;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "basket_value", nullable = false, precision = 19, scale = 4)
    private BigDecimal basketValue;

    @Column(name = "basket_fingerprint", nullable = false, length = 64)
    private String basketFingerprint;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_import_job_id", nullable = false)
    private ImportJob sourceImportJob;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @OneToMany(mappedBy = "receipt", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<TransactionLine> lines = new ArrayList<>();

    protected Receipt() {
    }

    public Receipt(
        Retailer retailer,
        Store store,
        String externalReceiptId,
        Instant transactionTimestamp,
        String currency,
        BigDecimal basketValue,
        String basketFingerprint,
        ImportJob sourceImportJob
    ) {
        this.retailer = retailer;
        this.store = store;
        this.externalReceiptId = externalReceiptId;
        this.transactionTimestamp = transactionTimestamp;
        this.currency = currency;
        this.basketValue = basketValue;
        this.basketFingerprint = basketFingerprint;
        this.sourceImportJob = sourceImportJob;
    }

    public void addLine(TransactionLine line) {
        lines.add(line);
    }

    public UUID getId() {
        return id;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public Store getStore() {
        return store;
    }

    public String getExternalReceiptId() {
        return externalReceiptId;
    }

    public Instant getTransactionTimestamp() {
        return transactionTimestamp;
    }

    public String getCurrency() {
        return currency;
    }

    public BigDecimal getBasketValue() {
        return basketValue;
    }

    public String getBasketFingerprint() {
        return basketFingerprint;
    }

    public List<TransactionLine> getLines() {
        return Collections.unmodifiableList(lines);
    }
}
