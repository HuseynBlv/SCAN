package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "scan_runtime_environment")
public class RuntimeEnvironmentClaim {

    @Id
    @Column(name = "singleton_id")
    private short id;

    @Column(name = "environment_name", nullable = false, length = 32)
    private String environmentName;

    @Column(name = "database_id", nullable = false, length = 128)
    private String databaseId;

    @Column(name = "claimed_at", nullable = false)
    private Instant claimedAt;

    protected RuntimeEnvironmentClaim() {
    }
}
