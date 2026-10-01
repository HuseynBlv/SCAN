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

/**
 * One target store on a field task, with its own fixed checklist. "external_store_id" (not a
 * Store foreign key) mirrors how the rest of SCAN references stores by their source system's
 * code - a task can target a store before/without a matching Store row existing yet.
 */
@Entity
@Table(
    name = "field_task_store",
    uniqueConstraints = @UniqueConstraint(
        name = "field_task_store_unique",
        columnNames = {"field_task_id", "external_store_id"}
    )
)
public class FieldTaskStore {

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "field_task_id", nullable = false)
    private FieldTask fieldTask;

    @Column(name = "external_store_id", nullable = false, length = 128)
    private String externalStoreId;

    @Column(name = "stock_available")
    private Boolean stockAvailable;

    @Column(name = "visible_in_cooler")
    private Boolean visibleInCooler;

    @Column(name = "correct_placement")
    private Boolean correctPlacement;

    @Column(name = "competitor_present")
    private Boolean competitorPresent;

    @Column(length = 1000)
    private String note;

    @Column(nullable = false)
    private boolean completed;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected FieldTaskStore() {
    }

    public FieldTaskStore(FieldTask fieldTask, String externalStoreId) {
        this.fieldTask = fieldTask;
        this.externalStoreId = externalStoreId;
    }

    public void recordResult(
        boolean stockAvailable,
        boolean visibleInCooler,
        boolean correctPlacement,
        boolean competitorPresent,
        String note
    ) {
        this.stockAvailable = stockAvailable;
        this.visibleInCooler = visibleInCooler;
        this.correctPlacement = correctPlacement;
        this.competitorPresent = competitorPresent;
        this.note = note;
        this.completed = true;
        this.completedAt = Instant.now();
    }

    /** A real issue if any part of the checklist that should be true (stock/visible/placement) came back false. */
    public boolean hasIssue() {
        if (!completed) return false;
        return Boolean.FALSE.equals(stockAvailable)
            || Boolean.FALSE.equals(visibleInCooler)
            || Boolean.FALSE.equals(correctPlacement);
    }

    public UUID getId() {
        return id;
    }

    public FieldTask getFieldTask() {
        return fieldTask;
    }

    public String getExternalStoreId() {
        return externalStoreId;
    }

    public Boolean getStockAvailable() {
        return stockAvailable;
    }

    public Boolean getVisibleInCooler() {
        return visibleInCooler;
    }

    public Boolean getCorrectPlacement() {
        return correctPlacement;
    }

    public Boolean getCompetitorPresent() {
        return competitorPresent;
    }

    public String getNote() {
        return note;
    }

    public boolean isCompleted() {
        return completed;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }
}
