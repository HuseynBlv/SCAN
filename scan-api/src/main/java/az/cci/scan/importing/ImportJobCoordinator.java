package az.cci.scan.importing;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.RetailerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class ImportJobCoordinator {

    private final RetailerRepository retailerRepository;
    private final ImportProfileRepository importProfileRepository;
    private final ImportJobRepository importJobRepository;

    public ImportJobCoordinator(
        RetailerRepository retailerRepository,
        ImportProfileRepository importProfileRepository,
        ImportJobRepository importJobRepository
    ) {
        this.retailerRepository = retailerRepository;
        this.importProfileRepository = importProfileRepository;
        this.importJobRepository = importJobRepository;
    }

    @Transactional
    public ImportJobStart begin(
        UUID retailerId,
        UUID profileId,
        String filename,
        String fileSha256
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
            attemptNumber
        ));
        return new ImportJobStart(created, false);
    }

    public record ImportJobStart(ImportJob job, boolean duplicateFile) {
    }
}
