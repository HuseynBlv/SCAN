package az.cci.scan.importing;

import az.cci.scan.domain.ImportJob;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ImportDtos {

    private ImportDtos() {
    }

    public record ImportJobResponse(
        UUID id,
        String retailerCode,
        String profileCode,
        String filename,
        ImportJob.Status status,
        boolean duplicateFile,
        int attemptNumber,
        int totalRows,
        int importedReceipts,
        int importedLines,
        int duplicateReceipts,
        int unresolvedProducts,
        List<String> errors,
        Instant createdAt,
        Instant completedAt
    ) {
        public static ImportJobResponse from(ImportJob job, boolean duplicateFile, List<String> errors) {
            return new ImportJobResponse(
                job.getId(),
                job.getRetailer().getCode(),
                job.getImportProfile().getCode(),
                job.getOriginalFilename(),
                job.getStatus(),
                duplicateFile,
                job.getAttemptNumber(),
                job.getTotalRows(),
                job.getImportedReceipts(),
                job.getImportedLines(),
                job.getDuplicateReceipts(),
                job.getUnresolvedProducts(),
                List.copyOf(errors),
                job.getCreatedAt(),
                job.getCompletedAt()
            );
        }
    }
}
