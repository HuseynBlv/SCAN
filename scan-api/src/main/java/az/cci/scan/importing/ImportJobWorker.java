package az.cci.scan.importing;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.operations.AuditService;
import az.cci.scan.repository.ImportJobRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class ImportJobWorker {

    private final ImportJobCoordinator coordinator;
    private final TransactionIngestionAnalyzer analyzer;
    private final ImportPersistenceService persistenceService;
    private final ImportJobRepository importJobRepository;
    private final AuditService auditService;

    public ImportJobWorker(
        ImportJobCoordinator coordinator,
        TransactionIngestionAnalyzer analyzer,
        ImportPersistenceService persistenceService,
        ImportJobRepository importJobRepository,
        AuditService auditService
    ) {
        this.coordinator = coordinator;
        this.analyzer = analyzer;
        this.persistenceService = persistenceService;
        this.importJobRepository = importJobRepository;
        this.auditService = auditService;
    }

    @Scheduled(
        fixedDelayString = "${scan.import-worker.poll-delay-ms:1000}",
        initialDelayString = "${scan.import-worker.initial-delay-ms:1000}"
    )
    public void poll() {
        coordinator.recoverStalled(Instant.now().minus(Duration.ofMinutes(30)));
        runOnce();
    }

    public boolean runOnce() {
        UUID jobId = coordinator.claimNext();
        if (jobId == null) return false;
        int rows = 0;
        ImportJobCoordinator.ImportWork work = null;
        try {
            work = coordinator.loadWork(jobId);
            IngestionAnalysis analysis = analyzer.analyze(
                work.retailer(), work.profile(), work.filename(), work.bytes()
            );
            rows = analysis.sourceRows();
            if (!analysis.valid()) {
                fail(jobId, work, rows, analysis.errors());
                return true;
            }
            ImportJob job = coordinator.markImporting(jobId, analysis.lines().size());
            persistenceService.persistAndComplete(
                work.retailer(), work.profile(), job, analysis.lines()
            );
            coordinator.removePayload(jobId);
            auditService.recordSystem(
                work.retailer(), work.submittedBy(), "IMPORT_COMPLETED", "IMPORT_JOB",
                jobId.toString(), analysis.reconciliation().receipts() + " receipts imported"
            );
        } catch (RuntimeException exception) {
            String message = exception.getMessage() == null ? "Import failed safely" : exception.getMessage();
            if (work != null) fail(jobId, work, rows, List.of(message));
            else coordinator.markFailed(jobId, rows, message);
        }
        return true;
    }

    private void fail(
        UUID jobId,
        ImportJobCoordinator.ImportWork work,
        int rows,
        List<String> errors
    ) {
        String summary = String.join("\n", errors.stream().limit(100).toList());
        coordinator.markFailed(jobId, rows, summary);
        auditService.recordSystem(
            work.retailer(), work.submittedBy(), "IMPORT_FAILED", "IMPORT_JOB",
            jobId.toString(), summary
        );
    }
}
