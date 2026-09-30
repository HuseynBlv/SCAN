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
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * A persistent business question SCAN (or a user) opened - the unit of institutional memory
 * this workspace is built around. An investigation starts from a detected change or a manual
 * question, accumulates hypotheses and notes as real evidence (including field-check results)
 * comes in, and stays queryable after it closes so the same question later ("have we seen this
 * before?") has something real to find.
 */
@Entity
@Table(name = "investigation")
public class Investigation {

    public enum Status {
        OPEN,
        IN_PROGRESS,
        CLOSED
    }

    public enum SubjectType {
        PRODUCT,
        STORE,
        CATEGORY,
        GENERAL
    }

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_id", nullable = false)
    private Retailer retailer;

    @Column(nullable = false, length = 256)
    private String title;

    @Column(nullable = false, length = 512)
    private String question;

    @Enumerated(EnumType.STRING)
    @Column(name = "subject_type", nullable = false, length = 32)
    private SubjectType subjectType;

    @Column(name = "subject_name", length = 256)
    private String subjectName;

    @Column(name = "period_days", nullable = false)
    private int periodDays;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status = Status.OPEN;

    @Column(name = "owner_label", nullable = false, length = 128)
    private String ownerLabel;

    @Column(name = "created_by", nullable = false, length = 128)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "closed_at")
    private Instant closedAt;

    @OneToMany(mappedBy = "investigation", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder asc")
    private List<InvestigationHypothesis> hypotheses = new ArrayList<>();

    // A Set, not a List: Hibernate cannot join-fetch two List ("bag") collections in a single
    // query (MultipleBagFetchException), and this entity already needs hypotheses fetched eagerly
    // alongside it. getNotes() still hands back an ordered List - callers never see the Set.
    @OneToMany(mappedBy = "investigation", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<InvestigationNote> notes = new LinkedHashSet<>();

    protected Investigation() {
    }

    public Investigation(
        Retailer retailer,
        String title,
        String question,
        SubjectType subjectType,
        String subjectName,
        int periodDays,
        String ownerLabel,
        String createdBy
    ) {
        this.retailer = retailer;
        this.title = title;
        this.question = question;
        this.subjectType = subjectType;
        this.subjectName = subjectName;
        this.periodDays = periodDays;
        this.ownerLabel = ownerLabel;
        this.createdBy = createdBy;
    }

    public void addHypothesis(InvestigationHypothesis hypothesis) {
        hypotheses.add(hypothesis);
        touch();
    }

    public void addNote(InvestigationNote note) {
        notes.add(note);
        touch();
    }

    public void markInProgress() {
        if (status == Status.OPEN) status = Status.IN_PROGRESS;
        touch();
    }

    public void close() {
        status = Status.CLOSED;
        closedAt = Instant.now();
        touch();
    }

    public void reopen() {
        status = Status.IN_PROGRESS;
        closedAt = null;
        touch();
    }

    private void touch() {
        updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public String getTitle() {
        return title;
    }

    public String getQuestion() {
        return question;
    }

    public SubjectType getSubjectType() {
        return subjectType;
    }

    public String getSubjectName() {
        return subjectName;
    }

    public int getPeriodDays() {
        return periodDays;
    }

    public Status getStatus() {
        return status;
    }

    public String getOwnerLabel() {
        return ownerLabel;
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

    public Instant getClosedAt() {
        return closedAt;
    }

    public List<InvestigationHypothesis> getHypotheses() {
        return Collections.unmodifiableList(hypotheses);
    }

    public List<InvestigationNote> getNotes() {
        return notes.stream()
            .sorted(Comparator.comparing(InvestigationNote::getCreatedAt).reversed())
            .toList();
    }
}
