package az.cci.scan.importing;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.ImportPayloadRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.domain.ImportPayload;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import java.time.Instant;
import java.util.List;

@Service
public class ImportJobCoordinator {

    private final RetailerRepository retailerRepository;
    private final ImportProfileRepository importProfileRepository;
    private final ImportJobRepository importJobRepository;
    private final ImportPayloadRepository importPayloadRepository;

    public ImportJobCoordinator(
        RetailerRepository retailerRepository,
        ImportProfileRepository importProfileRepository,
        ImportJobRepository importJobRepository,
        ImportPayloadRepository importPayloadRepository
    ) {
        this.retailerRepository = retailerRepository;
        this.importProfileRepository = importProfileRepository;
        this.importJobRepository = importJobRepository;
        this.importPayloadRepository = importPayloadRepository;
    }

    @Transactional
    public ImportJobStart begin(
        UUID retailerId,
        UUID profileId,
        String filename,
        String fileSha256,
        String submittedBy
    ) {
        Retailer retailer = retailerRepository.findLockedById(retailerId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown retailer: " + retailerId));
        ImportProfile profile = importProfileRepository.findById(profileId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown import profile: " + profileId));
        ImportJob previous = importJobRepository
            .findFirstByRetailerAndFileSha256OrderByAttemptNumberDesc(retailer, fileSha256)
            .orElse(null);

        if (previous != null && previous.getStatus() != ImportJob.Status.FAILED) {
            return new ImportJobStart(previous, true);
        }

        int attemptNumber = previous == null ? 1 : previous.getAttemptNumber() + 1;
        ImportJob created = importJobRepository.saveAndFlush(new ImportJob(
            retailer,
            profile,
            filename,
            fileSha256,
            attemptNumber,
            submittedBy
        ));
        return new ImportJobStart(created, false);
    }

    @Transactional
    public ImportJobResponseData enqueue(
        UUID retailerId,
        UUID profileId,
        String filename,
        String fileSha256,
        byte[] bytes,
        String submittedBy
    ) {
        ImportJobStart start = begin(retailerId, profileId, filename, fileSha256, submittedBy);
        if (!start.duplicateFile()) {
            importPayloadRepository.save(new ImportPayload(start.job(), bytes));
        }
        return new ImportJobResponseData(start.job(), start.duplicateFile());
    }

    @Transactional
    public UUID claimNext() {
        return importJobRepository.findFirstByStatusOrderByCreatedAtAsc(ImportJob.Status.RECEIVED)
            .map(job -> {
                job.markValidating();
                importJobRepository.saveAndFlush(job);
                return job.getId();
            })
            .orElse(null);
    }

    @Transactional(readOnly = true)
    public ImportWork loadWork(UUID jobId) {
        ImportJob job = importJobRepository.findById(jobId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown import job: " + jobId));
        ImportPayload payload = importPayloadRepository.findById(jobId)
            .orElseThrow(() -> new IllegalStateException("Queued import payload is missing"));
        return new ImportWork(
            job.getId(), job.getRetailer(), job.getImportProfile(), job.getOriginalFilename(),
            payload.getFileBytes(), job.getSubmittedBy()
        );
    }

    @Transactional
    public ImportJob markImporting(UUID jobId, int rows) {
        ImportJob job = importJobRepository.findById(jobId).orElseThrow();
        job.markImporting(rows);
        return importJobRepository.saveAndFlush(job);
    }

    @Transactional
    public ImportJob markFailed(UUID jobId, int rows, String error) {
        ImportJob job = importJobRepository.findById(jobId).orElseThrow();
        job.markFailed(rows, error);
        importPayloadRepository.deleteById(jobId);
        return importJobRepository.saveAndFlush(job);
    }

    @Transactional
    public void removePayload(UUID jobId) {
        importPayloadRepository.deleteById(jobId);
    }

    @Transactional
    public int recoverStalled(Instant cutoff) {
        List<ImportJob> stalled = importJobRepository.findAllByStatusInAndUpdatedAtBefore(
            List.of(ImportJob.Status.VALIDATING, ImportJob.Status.IMPORTING), cutoff
        );
        stalled.forEach(job -> {
            if (importPayloadRepository.existsById(job.getId())) {
                job.requeue();
            } else {
                job.markFailed(job.getTotalRows(), "Queued import payload is missing; submit the file again");
            }
        });
        importJobRepository.saveAll(stalled);
        return stalled.size();
    }

    public record ImportJobStart(ImportJob job, boolean duplicateFile) {
    }

    public record ImportJobResponseData(ImportJob job, boolean duplicateFile) {
    }

    public record ImportWork(
        UUID jobId,
        Retailer retailer,
        ImportProfile profile,
        String filename,
        byte[] bytes,
        String submittedBy
    ) {
    }
}
