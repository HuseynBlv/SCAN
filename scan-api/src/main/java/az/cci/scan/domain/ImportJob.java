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

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
    name = "import_job",
    uniqueConstraints = @UniqueConstraint(
        name = "import_job_retailer_hash_attempt_key",
        columnNames = {"retailer_id", "file_sha256", "attempt_number"}
    )
)
public class ImportJob {

    public enum Status {
        RECEIVED,
        VALIDATING,
        IMPORTING,
        COMPLETED,
        FAILED
    }

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_id", nullable = false)
    private Retailer retailer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "import_profile_id", nullable = false)
    private ImportProfile importProfile;

    @Column(name = "original_filename", nullable = false, length = 512)
    private String originalFilename;

    @Column(name = "file_sha256", nullable = false, length = 64)
    private String fileSha256;

    @Column(name = "attempt_number", nullable = false)
    private int attemptNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status = Status.RECEIVED;

    @Column(name = "total_rows", nullable = false)
    private int totalRows;

    @Column(name = "imported_receipts", nullable = false)
    private int importedReceipts;

    @Column(name = "imported_lines", nullable = false)
    private int importedLines;

    @Column(name = "duplicate_receipts", nullable = false)
    private int duplicateReceipts;

    @Column(name = "unresolved_products", nullable = false)
    private int unresolvedProducts;

    @Column(name = "error_summary")
    private String errorSummary;

    @Column(name = "submitted_by", nullable = false, length = 128)
    private String submittedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "completed_at")
    private Instant completedAt;

    protected ImportJob() {
    }

    public ImportJob(
        Retailer retailer,
        ImportProfile importProfile,
        String originalFilename,
        String fileSha256,
        int attemptNumber,
        String submittedBy
    ) {
        this.retailer = retailer;
        this.importProfile = importProfile;
        this.originalFilename = originalFilename;
        this.fileSha256 = fileSha256;
        this.attemptNumber = attemptNumber;
        this.submittedBy = submittedBy;
    }

    public void markValidating() {
        status = Status.VALIDATING;
        if (startedAt == null) startedAt = Instant.now();
        updatedAt = Instant.now();
    }

    public void markImporting(int totalRows) {
        status = Status.IMPORTING;
        this.totalRows = totalRows;
        updatedAt = Instant.now();
    }

    public void markCompleted(
        int totalRows,
        int importedReceipts,
        int importedLines,
        int duplicateReceipts,
        int unresolvedProducts
    ) {
        status = Status.COMPLETED;
        this.totalRows = totalRows;
        this.importedReceipts = importedReceipts;
        this.importedLines = importedLines;
        this.duplicateReceipts = duplicateReceipts;
        this.unresolvedProducts = unresolvedProducts;
        this.completedAt = Instant.now();
        this.updatedAt = completedAt;
        this.errorSummary = null;
    }

    public void markFailed(int totalRows, String errorSummary) {
        status = Status.FAILED;
        this.totalRows = totalRows;
        this.importedReceipts = 0;
        this.importedLines = 0;
        this.duplicateReceipts = 0;
        this.unresolvedProducts = 0;
        this.errorSummary = errorSummary;
        this.completedAt = Instant.now();
        this.updatedAt = completedAt;
    }

    public void requeue() {
        status = Status.RECEIVED;
        startedAt = null;
        updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public ImportProfile getImportProfile() {
        return importProfile;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getFileSha256() {
        return fileSha256;
    }

    public int getAttemptNumber() {
        return attemptNumber;
    }

    public Status getStatus() {
        return status;
    }

    public int getTotalRows() {
        return totalRows;
    }

    public int getImportedReceipts() {
        return importedReceipts;
    }

    public int getImportedLines() {
        return importedLines;
    }

    public int getDuplicateReceipts() {
        return duplicateReceipts;
    }

    public int getUnresolvedProducts() {
        return unresolvedProducts;
    }

    public String getErrorSummary() {
        return errorSummary;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public String getSubmittedBy() { return submittedBy; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
