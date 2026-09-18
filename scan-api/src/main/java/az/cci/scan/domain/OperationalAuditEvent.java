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

@Entity
@Table(name = "operational_audit_event")
public class OperationalAuditEvent {

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "retailer_id")
    private Retailer retailer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_account_id")
    private ScanAccount actorAccount;

    @Column(name = "actor_username", nullable = false, length = 128)
    private String actorUsername;

    @Column(name = "event_type", nullable = false, length = 64)
    private String eventType;

    @Column(name = "subject_type", nullable = false, length = 64)
    private String subjectType;

    @Column(name = "subject_id", length = 128)
    private String subjectId;

    @Column(length = 2000)
    private String detail;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    protected OperationalAuditEvent() {
    }

    public OperationalAuditEvent(
        Retailer retailer,
        ScanAccount actorAccount,
        String actorUsername,
        String eventType,
        String subjectType,
        String subjectId,
        String detail
    ) {
        this.retailer = retailer;
        this.actorAccount = actorAccount;
        this.actorUsername = actorUsername;
        this.eventType = eventType;
        this.subjectType = subjectType;
        this.subjectId = subjectId;
        this.detail = detail;
    }

    public UUID getId() { return id; }
    public Retailer getRetailer() { return retailer; }
    public String getActorUsername() { return actorUsername; }
    public String getEventType() { return eventType; }
    public String getSubjectType() { return subjectType; }
    public String getSubjectId() { return subjectId; }
    public String getDetail() { return detail; }
    public Instant getOccurredAt() { return occurredAt; }
}
