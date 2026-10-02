package az.cci.scan.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A test-vs-control commercial trial for one product: a set of test stores compared against a set
 * of control stores, over a dated window. Status is never stored - it is always derived from
 * {@code startDate}/{@code endDate} against the current moment (see {@link #status(Instant)}), so
 * it can never drift out of sync with reality the way a manually-set field could.
 *
 * <p>Scoped to one product and two real metrics (basket penetration, revenue) - see the V17
 * migration for why there is no generic multi-metric framework here.
 */
@Entity
@Table(name = "activation")
public class Activation {

    public enum PrimaryMetric {
        BASKET_PENETRATION,
        REVENUE
    }

    public enum Status {
        DRAFT,
        RUNNING,
        COMPLETED
    }

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_id", nullable = false)
    private Retailer retailer;

    @Column(nullable = false, length = 256)
    private String name;

    @Column(nullable = false, length = 512)
    private String objective;

    @Column(nullable = false, length = 512)
    private String hypothesis;

    @Column(name = "product_name", nullable = false, length = 256)
    private String productName;

    @Enumerated(EnumType.STRING)
    @Column(name = "primary_metric", nullable = false, length = 32)
    private PrimaryMetric primaryMetric;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "created_by", nullable = false, length = 128)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @OneToMany(mappedBy = "activation", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ActivationStore> stores = new ArrayList<>();

    protected Activation() {
    }

    public Activation(
        Retailer retailer, String name, String objective, String hypothesis, String productName,
        PrimaryMetric primaryMetric, LocalDate startDate, LocalDate endDate, String createdBy
    ) {
        this.retailer = retailer;
        this.name = name;
        this.objective = objective;
        this.hypothesis = hypothesis;
        this.productName = productName;
        this.primaryMetric = primaryMetric;
        this.startDate = startDate;
        this.endDate = endDate;
        this.createdBy = createdBy;
    }

    public void addStore(ActivationStore store) {
        stores.add(store);
    }

    /** Derived, never stored: DRAFT before startDate, RUNNING through endDate, COMPLETED after. */
    public Status status(Instant now) {
        Instant start = startDate.atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
        Instant end = endDate.plusDays(1).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();
        if (now.isBefore(start)) return Status.DRAFT;
        if (now.isBefore(end)) return Status.RUNNING;
        return Status.COMPLETED;
    }

    public UUID getId() {
        return id;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public String getName() {
        return name;
    }

    public String getObjective() {
        return objective;
    }

    public String getHypothesis() {
        return hypothesis;
    }

    public String getProductName() {
        return productName;
    }

    public PrimaryMetric getPrimaryMetric() {
        return primaryMetric;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<ActivationStore> getStores() {
        return java.util.Collections.unmodifiableList(stores);
    }
}
