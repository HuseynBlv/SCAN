package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/**
 * A possible explanation SCAN generated for an investigation - never presented as a fact. Every
 * hypothesis this codebase generates must trace to a real, computed signal (see
 * ChangeDetectionService); "confidence" reflects how strong that signal is, not a guess.
 */
@Entity
@Table(name = "investigation_hypothesis")
public class InvestigationHypothesis {

    public enum Confidence {
        LOW,
        MEDIUM,
        HIGH
    }

    public enum Status {
        OPEN,
        CONFIRMED,
        REJECTED
    }

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "investigation_id", nullable = false)
    private Investigation investigation;

    @Column(nullable = false, length = 512)
    private String statement;

    @Column(name = "supporting_evidence", nullable = false, length = 512)
    private String supportingEvidence;

    @Column(name = "contradicting_evidence", length = 512)
    private String contradictingEvidence;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Confidence confidence;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.OPEN;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected InvestigationHypothesis() {
    }

    public InvestigationHypothesis(
        Investigation investigation,
        String statement,
        String supportingEvidence,
        String contradictingEvidence,
        Confidence confidence,
        int sortOrder
    ) {
        this.investigation = investigation;
        this.statement = statement;
        this.supportingEvidence = supportingEvidence;
        this.contradictingEvidence = contradictingEvidence;
        this.confidence = confidence;
        this.sortOrder = sortOrder;
    }

    public void strengthen(String additionalSupportingEvidence, Confidence newConfidence) {
        this.supportingEvidence = additionalSupportingEvidence;
        this.confidence = newConfidence;
        this.updatedAt = Instant.now();
    }

    public void markConfirmed() {
        this.status = Status.CONFIRMED;
        this.updatedAt = Instant.now();
    }

    public void markRejected() {
        this.status = Status.REJECTED;
        this.updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public Investigation getInvestigation() {
        return investigation;
    }

    public String getStatement() {
        return statement;
    }

    public String getSupportingEvidence() {
        return supportingEvidence;
    }

    public String getContradictingEvidence() {
        return contradictingEvidence;
    }

    public Confidence getConfidence() {
        return confidence;
    }

    public Status getStatus() {
        return status;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
