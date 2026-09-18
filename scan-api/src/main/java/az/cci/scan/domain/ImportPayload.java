package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "import_payload")
public class ImportPayload {

    @Id
    @Column(name = "import_job_id")
    private java.util.UUID importJobId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId
    @JoinColumn(name = "import_job_id", nullable = false)
    private ImportJob importJob;

    @Column(name = "file_bytes", nullable = false)
    private byte[] fileBytes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected ImportPayload() {
    }

    public ImportPayload(ImportJob importJob, byte[] fileBytes) {
        this.importJob = importJob;
        this.fileBytes = fileBytes.clone();
    }

    public ImportJob getImportJob() {
        return importJob;
    }

    public byte[] getFileBytes() {
        return fileBytes.clone();
    }
}
