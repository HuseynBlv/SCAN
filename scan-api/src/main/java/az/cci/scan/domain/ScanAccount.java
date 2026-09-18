package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.Locale;
import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "scan_account")
public class ScanAccount {

    public enum Role {
        ADMIN,
        CCI,
        INGEST,
        ONBOARDING,
        RETAILER
    }

    @Id
    @UuidGenerator
    private UUID id;

    @Column(nullable = false, unique = true, length = 128)
    private String username;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "account_role", nullable = false, length = 32)
    private Role role;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "retailer_id")
    private Retailer retailer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "import_profile_id")
    private ImportProfile importProfile;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "scan_account_retailer_access",
        joinColumns = @JoinColumn(name = "account_id"),
        inverseJoinColumns = @JoinColumn(name = "retailer_id")
    )
    private Set<Retailer> retailerAccess = new LinkedHashSet<>();

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "last_rotated_at")
    private Instant lastRotatedAt;

    protected ScanAccount() {
    }

    public ScanAccount(
        String username,
        String passwordHash,
        Role role,
        Retailer retailer,
        ImportProfile importProfile
    ) {
        this.username = normalizeUsername(username);
        this.passwordHash = Objects.requireNonNull(passwordHash);
        this.role = Objects.requireNonNull(role);
        this.retailer = retailer;
        this.importProfile = importProfile;
        validateScope();
    }

    public void rotatePassword(String passwordHash) {
        this.passwordHash = Objects.requireNonNull(passwordHash);
        this.lastRotatedAt = Instant.now();
        this.updatedAt = lastRotatedAt;
    }

    public void revoke() {
        enabled = false;
        revokedAt = Instant.now();
        updatedAt = revokedAt;
    }

    public void grantRetailerAccess(Retailer grantedRetailer) {
        if (role != Role.CCI) {
            throw new IllegalStateException("Only CCI accounts use retailer access grants");
        }
        retailerAccess.add(Objects.requireNonNull(grantedRetailer));
        updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Role getRole() {
        return role;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public ImportProfile getImportProfile() {
        return importProfile;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getRevokedAt() { return revokedAt; }
    public Instant getLastRotatedAt() { return lastRotatedAt; }

    public Set<Retailer> getRetailerAccess() {
        return Set.copyOf(retailerAccess);
    }

    private void validateScope() {
        if ((role == Role.CCI || role == Role.ONBOARDING)
            && (retailer != null || importProfile != null)) {
            throw new IllegalArgumentException(role + " accounts must not be bound to one retailer");
        }
        if (role == Role.RETAILER && (retailer == null || importProfile != null)) {
            throw new IllegalArgumentException("Retailer accounts require one retailer and no import profile");
        }
        if ((role == Role.ADMIN || role == Role.INGEST)
            && (retailer == null || importProfile == null
                || !Objects.equals(retailer.getId(), importProfile.getRetailer().getId()))) {
            throw new IllegalArgumentException("Import accounts require a profile owned by their retailer");
        }
    }

    private String normalizeUsername(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Account username is required");
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
