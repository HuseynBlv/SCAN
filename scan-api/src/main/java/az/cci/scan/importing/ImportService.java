package az.cci.scan.importing;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.RetailerRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

import static az.cci.scan.importing.ImportDtos.ImportJobResponse;

@Service
public class ImportService {

    private final RetailerRepository retailerRepository;
    private final ImportProfileRepository importProfileRepository;
    private final ImportJobRepository importJobRepository;
    private final List<TransactionFileParser> parsers;
    private final TransactionRowMapper rowMapper;
    private final ImportPersistenceService persistenceService;

    public ImportService(
        RetailerRepository retailerRepository,
        ImportProfileRepository importProfileRepository,
        ImportJobRepository importJobRepository,
        List<TransactionFileParser> parsers,
        TransactionRowMapper rowMapper,
        ImportPersistenceService persistenceService
    ) {
        this.retailerRepository = retailerRepository;
        this.importProfileRepository = importProfileRepository;
        this.importJobRepository = importJobRepository;
        this.parsers = parsers;
        this.rowMapper = rowMapper;
        this.persistenceService = persistenceService;
    }

    public ImportJobResponse importFile(
        String retailerCode,
        String profileCode,
        MultipartFile file
    ) {
        Retailer retailer = retailerRepository.findByCodeIgnoreCase(retailerCode)
            .orElseThrow(() -> new IllegalArgumentException("Unknown retailer: " + retailerCode));
        ImportProfile profile = importProfileRepository.findByRetailerAndCodeIgnoreCase(retailer, profileCode)
            .orElseThrow(() -> new IllegalArgumentException("Unknown import profile: " + profileCode));

        byte[] bytes = readBytes(file);
        String hash = sha256(bytes);
        var duplicate = importJobRepository.findByRetailerAndFileSha256(retailer, hash);
        if (duplicate.isPresent()) {
            return ImportJobResponse.from(duplicate.get(), true, existingErrors(duplicate.get()));
        }

        String filename = safeFilename(file.getOriginalFilename());
        ImportJob job = importJobRepository.save(new ImportJob(retailer, profile, filename, hash));
        if (bytes.length == 0) {
            return fail(job, 0, List.of("file: uploaded file is empty"));
        }

        TransactionFileParser parser = parsers.stream()
            .filter(candidate -> candidate.supports(filename))
            .findFirst()
            .orElse(null);
        if (parser == null) {
            return fail(job, 0, List.of("file: only .csv, .xls, and .xlsx files are supported"));
        }

        try {
            job.markValidating();
            importJobRepository.save(job);
            ParsedTable table = parser.parse(new ByteArrayInputStream(bytes), profile);
            RowMappingResult mapping = rowMapper.map(table, profile);
            if (!mapping.isValid()) {
                List<String> errors = mapping.errors().stream().map(ImportValidationError::toString).toList();
                return fail(job, table.rows().size(), errors);
            }

            job.markImporting(mapping.lines().size());
            importJobRepository.save(job);
            ImportPersistenceResult result = persistenceService.persist(retailer, profile, job, mapping.lines());
            job.markCompleted(
                mapping.lines().size(),
                result.importedReceipts(),
                result.importedLines(),
                result.duplicateReceipts(),
                result.unresolvedProducts()
            );
            importJobRepository.save(job);
            return ImportJobResponse.from(job, false, List.of());
        } catch (IOException | RuntimeException exception) {
            return fail(job, job.getTotalRows(), List.of(safeErrorMessage(exception)));
        }
    }

    public ImportJobResponse getJob(java.util.UUID jobId) {
        ImportJob job = importJobRepository.findById(jobId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown import job: " + jobId));
        return ImportJobResponse.from(job, false, existingErrors(job));
    }

    private ImportJobResponse fail(ImportJob job, int totalRows, List<String> errors) {
        String summary = String.join("\n", errors.stream().limit(100).toList());
        job.markFailed(totalRows, summary);
        importJobRepository.save(job);
        return ImportJobResponse.from(job, false, errors);
    }

    private List<String> existingErrors(ImportJob job) {
        if (job.getErrorSummary() == null || job.getErrorSummary().isBlank()) {
            return List.of();
        }
        return job.getErrorSummary().lines().toList();
    }

    private byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException exception) {
            throw new IllegalArgumentException("Unable to read uploaded file", exception);
        }
    }

    private String safeFilename(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return "upload";
        }
        String normalized = originalFilename.replace('\\', '/');
        return Path.of(normalized).getFileName().toString();
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String safeErrorMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "Import failed safely" : message;
    }
}
