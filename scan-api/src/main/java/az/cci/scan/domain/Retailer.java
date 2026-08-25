package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "retailer")
public class Retailer {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(nullable = false, unique = true, length = 64)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(name = "zone_id", nullable = false, length = 64)
    private String zoneId = "Asia/Baku";

    @Column(name = "cci_sharing_enabled", nullable = false)
    private boolean cciSharingEnabled;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected Retailer() {
    }

    public Retailer(String code, String name, String zoneId, boolean cciSharingEnabled) {
        this.code = code;
        this.name = name;
        this.zoneId = zoneId;
        this.cciSharingEnabled = cciSharingEnabled;
    }

    public UUID getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public String getZoneId() {
        return zoneId;
    }

    public boolean isCciSharingEnabled() {
        return cciSharingEnabled;
    }
}
