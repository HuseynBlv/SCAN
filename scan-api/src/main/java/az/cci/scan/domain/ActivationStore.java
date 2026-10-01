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
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.UuidGenerator;

import java.util.UUID;

/** One store assigned to an activation's test or control group. */
@Entity
@Table(
    name = "activation_store",
    uniqueConstraints = @UniqueConstraint(name = "activation_store_unique", columnNames = {"activation_id", "external_store_id"})
)
public class ActivationStore {

    public enum Group {
        TEST,
        CONTROL
    }

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "activation_id", nullable = false)
    private Activation activation;

    @Column(name = "external_store_id", nullable = false, length = 128)
    private String externalStoreId;

    @Enumerated(EnumType.STRING)
    @Column(name = "store_group", nullable = false, length = 16)
    private Group group;

    protected ActivationStore() {
    }

    public ActivationStore(Activation activation, String externalStoreId, Group group) {
        this.activation = activation;
        this.externalStoreId = externalStoreId;
        this.group = group;
    }

    public UUID getId() {
        return id;
    }

    public Activation getActivation() {
        return activation;
    }

    public String getExternalStoreId() {
        return externalStoreId;
    }

    public Group getGroup() {
        return group;
    }
}
