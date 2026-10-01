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
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * The bridge from insight to execution: a real, assignable request to check something in named
 * stores, with a fixed availability/placement/competitor checklist per store. Optionally linked
 * to the investigation it came from, so a completed result can be reflected back into it.
 */
@Entity
@Table(name = "field_task")
public class FieldTask {

    public enum Status {
        OPEN,
        COMPLETED
    }

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_id", nullable = false)
    private Retailer retailer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "investigation_id")
    private Investigation investigation;

    @Column(nullable = false, length = 256)
    private String title;

    @Column(nullable = false, length = 512)
    private String reason;

    @Column(name = "assigned_to", nullable = false, length = 128)
    private String assignedTo;

    @Column(name = "due_at")
    private Instant dueAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status = Status.OPEN;

    @Column(name = "created_by", nullable = false, length = 128)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @OneToMany(mappedBy = "fieldTask", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<FieldTaskStore> stores = new ArrayList<>();

    protected FieldTask() {
    }

    public FieldTask(
        Retailer retailer,
        Investigation investigation,
        String title,
        String reason,
        String assignedTo,
        Instant dueAt,
        String createdBy
    ) {
        this.retailer = retailer;
        this.investigation = investigation;
        this.title = title;
        this.reason = reason;
        this.assignedTo = assignedTo;
        this.dueAt = dueAt;
        this.createdBy = createdBy;
    }

    public void addStore(FieldTaskStore store) {
        stores.add(store);
    }

    public void refreshCompletion() {
        boolean allDone = !stores.isEmpty() && stores.stream().allMatch(FieldTaskStore::isCompleted);
        status = allDone ? Status.COMPLETED : Status.OPEN;
        updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public Investigation getInvestigation() {
        return investigation;
    }

    public String getTitle() {
        return title;
    }

    public String getReason() {
        return reason;
    }

    public String getAssignedTo() {
        return assignedTo;
    }

    public Instant getDueAt() {
        return dueAt;
    }

    public Status getStatus() {
        return status;
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

    public List<FieldTaskStore> getStores() {
        return Collections.unmodifiableList(stores);
    }
}
