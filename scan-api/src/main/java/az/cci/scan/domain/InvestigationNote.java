package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/**
 * A note on an investigation - either written by a person, or written by SCAN itself when real
 * evidence (most notably a completed field task) changes what's known. System notes are how a
 * field-check result becomes visible inside the investigation it was requested for.
 */
@Entity
@Table(name = "investigation_note")
public class InvestigationNote {

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "investigation_id", nullable = false)
    private Investigation investigation;

    @Column(name = "author_username", nullable = false, length = 128)
    private String authorUsername;

    @Column(nullable = false, length = 2000)
    private String body;

    @Column(name = "is_system", nullable = false)
    private boolean system;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected InvestigationNote() {
    }

    public InvestigationNote(Investigation investigation, String authorUsername, String body, boolean system) {
        this.investigation = investigation;
        this.authorUsername = authorUsername;
        this.body = body;
        this.system = system;
    }

    public UUID getId() {
        return id;
    }

    public Investigation getInvestigation() {
        return investigation;
    }

    public String getAuthorUsername() {
        return authorUsername;
    }

    public String getBody() {
        return body;
    }

    public boolean isSystem() {
        return system;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
