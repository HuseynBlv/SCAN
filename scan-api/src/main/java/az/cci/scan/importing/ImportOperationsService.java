package az.cci.scan.importing;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.OperationalAuditEventRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.time.Duration;
import java.time.Instant;

import static az.cci.scan.importing.ImportDtos.AuditEventResponse;
import static az.cci.scan.importing.ImportDtos.ImportJobResponse;
import static az.cci.scan.importing.ImportDtos.ImportOperationsResponse;

@Service
public class ImportOperationsService {

    private final ImportJobRepository jobRepository;
    private final OperationalAuditEventRepository auditRepository;

    public ImportOperationsService(
        ImportJobRepository jobRepository,
        OperationalAuditEventRepository auditRepository
    ) {
        this.jobRepository = jobRepository;
        this.auditRepository = auditRepository;
    }

    @Transactional(readOnly = true)
    public List<ImportJobResponse> history(Retailer retailer, int limit) {
        return jobRepository.findAllByRetailerOrderByCreatedAtDesc(
            retailer, PageRequest.of(0, bounded(limit))
        ).stream().map(job -> ImportJobResponse.from(job, false, errors(job))).toList();
    }

    @Transactional(readOnly = true)
    public List<AuditEventResponse> audit(Retailer retailer, int limit) {
        return auditRepository.findAllByRetailerOrderByOccurredAtDesc(
            retailer, PageRequest.of(0, bounded(limit))
        ).stream().map(event -> new AuditEventResponse(
            event.getId(), event.getActorUsername(), event.getEventType(), event.getSubjectType(),
            event.getSubjectId(), event.getDetail(), event.getOccurredAt()
        )).toList();
    }

    @Transactional(readOnly = true)
    public ImportOperationsResponse operations(Retailer retailer) {
        ImportJob oldest = jobRepository.findFirstByRetailerAndStatusOrderByCreatedAtAsc(
            retailer, ImportJob.Status.RECEIVED
        ).orElse(null);
        ImportJob latestCompleted = jobRepository.findFirstByRetailerAndStatusOrderByCreatedAtDesc(
            retailer, ImportJob.Status.COMPLETED
        ).orElse(null);
        return new ImportOperationsResponse(
            jobRepository.countByRetailerAndStatus(retailer, ImportJob.Status.RECEIVED),
            jobRepository.countByRetailerAndStatus(retailer, ImportJob.Status.VALIDATING),
            jobRepository.countByRetailerAndStatus(retailer, ImportJob.Status.IMPORTING),
            jobRepository.countByRetailerAndStatusAndCompletedAtAfter(
                retailer, ImportJob.Status.FAILED, Instant.now().minus(Duration.ofHours(24))
            ),
            oldest == null ? null : oldest.getCreatedAt(),
            latestCompleted == null ? null : latestCompleted.getCompletedAt()
        );
    }

    private int bounded(int limit) { return Math.max(1, Math.min(limit, 100)); }
    private List<String> errors(ImportJob job) {
        return job.getErrorSummary() == null ? List.of() : job.getErrorSummary().lines().toList();
    }
}
