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

@Entity
@Table(
    name = "store",
    uniqueConstraints = @UniqueConstraint(
        name = "store_retailer_external_key",
        columnNames = {"retailer_id", "external_store_id"}
    )
)
public class Store {

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_id", nullable = false)
    private Retailer retailer;

    @Column(name = "external_store_id", nullable = false, length = 128)
    private String externalStoreId;

    @Column(nullable = false)
    private String name;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected Store() {
    }

    public Store(Retailer retailer, String externalStoreId, String name) {
        this.retailer = retailer;
        this.externalStoreId = externalStoreId;
        this.name = name;
    }

    public UUID getId() {
        return id;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public String getExternalStoreId() {
        return externalStoreId;
    }

    public String getName() {
        return name;
    }
}
