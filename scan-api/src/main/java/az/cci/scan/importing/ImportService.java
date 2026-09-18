package az.cci.scan.importing;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportPreview;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportPreviewRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.RetailerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.core.Authentication;
import az.cci.scan.operations.AuditService;

import java.io.IOException;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static az.cci.scan.importing.ImportDtos.ColumnMappingRequest;
import static az.cci.scan.importing.ImportDtos.ImportContextResponse;
import static az.cci.scan.importing.ImportDtos.ImportFieldMappingResponse;
import static az.cci.scan.importing.ImportDtos.ImportJobResponse;
import static az.cci.scan.importing.ImportDtos.ImportPreviewResponse;
import static az.cci.scan.importing.ImportDtos.UpdateImportMappingRequest;

@Service
public class ImportService {

    private static final Map<String, List<String>> COLUMN_ALIASES = aliases();

    private final RetailerRepository retailerRepository;
    private final ImportProfileRepository importProfileRepository;
    private final ImportJobRepository importJobRepository;
    private final ImportPreviewRepository importPreviewRepository;
    private final ImportJobCoordinator jobCoordinator;
    private final TransactionIngestionAnalyzer analyzer;
    private final ImportPersistenceService persistenceService;
    private final AuditService auditService;

    public ImportService(
        RetailerRepository retailerRepository,
        ImportProfileRepository importProfileRepository,
        ImportJobRepository importJobRepository,
        ImportPreviewRepository importPreviewRepository,
        ImportJobCoordinator jobCoordinator,
        TransactionIngestionAnalyzer analyzer,
        ImportPersistenceService persistenceService,
        AuditService auditService
    ) {
        this.retailerRepository = retailerRepository;
        this.importProfileRepository = importProfileRepository;
        this.importJobRepository = importJobRepository;
        this.importPreviewRepository = importPreviewRepository;
        this.jobCoordinator = jobCoordinator;
        this.analyzer = analyzer;
        this.persistenceService = persistenceService;
        this.auditService = auditService;
    }

    public ImportJobResponse importFile(String retailerCode, String profileCode, MultipartFile file) {
        Retailer retailer = retailerRepository.findByCodeIgnoreCase(retailerCode)
            .orElseThrow(() -> new IllegalArgumentException("Unknown retailer: " + retailerCode));
        ImportProfile profile = importProfileRepository.findByRetailerAndCodeIgnoreCase(retailer, profileCode)
            .orElseThrow(() -> new IllegalArgumentException("Unknown import profile: " + profileCode));
        return importFile(retailer, profile, file);
    }

    public ImportJobResponse importFile(Retailer retailer, ImportProfile profile, MultipartFile file) {
        assertImportEnabled(retailer, profile);
        byte[] bytes = readBytes(file);
        String filename = safeFilename(file.getOriginalFilename());
        IngestionAnalysis analysis = bytes.length == 0
            ? emptyAnalysis()
            : analyzer.analyze(retailer, profile, filename, bytes);
        return persistImport(retailer, profile, filename, bytes, analysis);
    }

    public ImportJobResponse enqueueFile(
        Retailer retailer,
        ImportProfile profile,
        MultipartFile file,
        Authentication authentication
    ) {
        assertImportEnabled(retailer, profile);
        byte[] bytes = readBytes(file);
        if (bytes.length == 0) throw new IllegalArgumentException("Uploaded file is empty");
        String filename = safeFilename(file.getOriginalFilename());
        String actor = authentication == null ? "system" : authentication.getName();
        ImportJobCoordinator.ImportJobResponseData queued = jobCoordinator.enqueue(
            retailer.getId(), profile.getId(), filename, sha256(bytes), bytes, actor
        );
        auditService.record(
            retailer, authentication, queued.duplicateFile() ? "IMPORT_DUPLICATE" : "IMPORT_QUEUED",
            "IMPORT_JOB", queued.job().getId().toString(), filename
        );
        return ImportJobResponse.from(queued.job(), queued.duplicateFile(), existingErrors(queued.job()));
    }

    @Transactional
    public ImportPreviewResponse preview(Retailer retailer, ImportProfile profile, MultipartFile file) {
        if (!retailer.isTransactionImportEnabled()) {
            throw new IllegalArgumentException("Retailer onboarding must be completed before production preview");
        }
        if (!profile.getRetailer().getId().equals(retailer.getId())) {
            throw new IllegalArgumentException("Import profile does not belong to this retailer");
        }
        importPreviewRepository.deleteAllByImportProfile(profile);
        byte[] bytes = readBytes(file);
        String filename = safeFilename(file.getOriginalFilename());
        IngestionAnalysis analysis = bytes.length == 0
            ? emptyAnalysis()
            : analyzer.analyzeForPreview(retailer, profile, filename, bytes);
        boolean mappingRequired = analysis.adapterCode().equals("COLUMN_MAPPING")
            && analysis.errors().stream().anyMatch(error -> error.contains("required column is missing"));
        ImportPreview saved = null;
        if (analysis.valid()) {
            profile.markValidated();
            importProfileRepository.save(profile);
            saved = importPreviewRepository.save(new ImportPreview(
                retailer,
                profile,
                filename,
                sha256(bytes),
                analysis
            ));
        }
        return previewResponse(profile, filename, analysis, saved, mappingRequired);
    }

    @Transactional
    public ImportContextResponse updateMapping(
        Retailer retailer,
        ImportProfile profile,
        UpdateImportMappingRequest request
    ) {
        if (!profile.getRetailer().getId().equals(retailer.getId())) {
            throw new IllegalArgumentException("Import profile does not belong to this retailer");
        }
        importPreviewRepository.deleteAllByImportProfile(profile);
        validateMapping(request);
        ColumnMappingRequest columns = request.columns();
        profile.updateMapping(
            request.delimiter().charAt(0),
            clean(request.dateTimePattern()),
            clean(columns.storeId()),
            clean(columns.receiptId()),
            clean(columns.timestamp()),
            optional(columns.productCode()),
            optional(columns.barcode()),
            clean(columns.productName()),
            clean(columns.quantity()),
            clean(columns.unitPrice()),
            clean(columns.discountAmount()),
            clean(columns.lineTotal())
        );
        importProfileRepository.save(profile);
        return ImportContextResponse.from(retailer, profile);
    }

    @Transactional
    public ImportJobResponse importPreviewedFile(
        Retailer retailer,
        ImportProfile profile,
        UUID previewId,
        MultipartFile file
    ) {
        assertImportEnabled(retailer, profile);
        byte[] bytes = readBytes(file);
        String filename = safeFilename(file.getOriginalFilename());
        String hash = sha256(bytes);
        IngestionAnalysis analysis = analyzer.analyzeForPreview(retailer, profile, filename, bytes);
        if (!analysis.valid()) {
            throw new IllegalArgumentException("File no longer passes reconciliation; validate it again");
        }
        ImportPreview preview = importPreviewRepository.findByIdAndRetailer(previewId, retailer)
            .orElseThrow(() -> new IllegalArgumentException("Unknown import preview"));
        preview.assertUsable(retailer, profile, hash, analysis);
        ImportJobResponse response = persistImport(retailer, profile, filename, bytes, analysis);
        if (response.status() == ImportJob.Status.COMPLETED) {
            preview.consume();
            importPreviewRepository.save(preview);
        }
        return response;
    }

    @Transactional
    public ImportJobResponse enqueuePreviewedFile(
        Retailer retailer,
        ImportProfile profile,
        UUID previewId,
        MultipartFile file,
        Authentication authentication
    ) {
        assertImportEnabled(retailer, profile);
        byte[] bytes = readBytes(file);
        String filename = safeFilename(file.getOriginalFilename());
        String hash = sha256(bytes);
        IngestionAnalysis analysis = analyzer.analyzeForPreview(retailer, profile, filename, bytes);
        if (!analysis.valid()) {
            throw new IllegalArgumentException("File no longer passes reconciliation; validate it again");
        }
        ImportPreview preview = importPreviewRepository.findByIdAndRetailer(previewId, retailer)
            .orElseThrow(() -> new IllegalArgumentException("Unknown import preview"));
        preview.assertUsable(retailer, profile, hash, analysis);
        String actor = authentication == null ? "system" : authentication.getName();
        ImportJobCoordinator.ImportJobResponseData queued = jobCoordinator.enqueue(
            retailer.getId(), profile.getId(), filename, hash, bytes, actor
        );
        preview.consume();
        importPreviewRepository.save(preview);
        auditService.record(
            retailer, authentication, queued.duplicateFile() ? "IMPORT_DUPLICATE" : "IMPORT_QUEUED",
            "IMPORT_JOB", queued.job().getId().toString(), filename
        );
        return ImportJobResponse.from(queued.job(), queued.duplicateFile(), existingErrors(queued.job()));
    }

    public ImportJobResponse getJob(Retailer retailer, UUID jobId) {
        ImportJob job = importJobRepository.findByIdAndRetailer(jobId, retailer)
            .orElseThrow(() -> new IllegalArgumentException("Unknown import job: " + jobId));
        return ImportJobResponse.from(job, false, existingErrors(job));
    }

    private ImportJobResponse persistImport(
        Retailer retailer,
        ImportProfile profile,
        String filename,
        byte[] bytes,
        IngestionAnalysis analysis
    ) {
        String hash = sha256(bytes);
        ImportJobCoordinator.ImportJobStart start = jobCoordinator.begin(
            retailer.getId(), profile.getId(), filename, hash, "system"
        );
        ImportJob job = start.job();
        if (start.duplicateFile()) {
            return ImportJobResponse.from(job, true, existingErrors(job));
        }
        if (bytes.length == 0) {
            return fail(job, 0, List.of("file: uploaded file is empty"));
        }
        try {
            job.markValidating();
            importJobRepository.save(job);
            if (!analysis.valid()) {
                return fail(job, analysis.sourceRows(), analysis.errors());
            }
            job.markImporting(analysis.lines().size());
            importJobRepository.save(job);
            persistenceService.persistAndComplete(retailer, profile, job, analysis.lines());
            return ImportJobResponse.from(job, false, List.of());
        } catch (RuntimeException exception) {
            return fail(job, job.getTotalRows(), List.of(safeErrorMessage(exception)));
        }
    }

    private ImportPreviewResponse previewResponse(
        ImportProfile profile,
        String filename,
        IngestionAnalysis analysis,
        ImportPreview preview,
        boolean mappingRequired
    ) {
        IngestionAnalysis.Reconciliation totals = analysis.reconciliation();
        return new ImportPreviewResponse(
            preview == null ? null : preview.getId(),
            preview != null,
            mappingRequired,
            filename,
            analysis.adapterCode(),
            analysis.adapterName(),
            analysis.sourceRows(),
            totals.receipts(),
            totals.productLines(),
            totals.distinctProducts(),
            analysis.sourceHeaders(),
            totals.storeIds(),
            totals.quantity(),
            totals.grossSales(),
            totals.discounts(),
            totals.reportedNetSales(),
            totals.calculatedNetSales(),
            totals.difference(),
            profile.getCurrency(),
            totals.firstTransactionAt(),
            totals.lastTransactionAt(),
            preview == null ? null : preview.getExpiresAt(),
            fieldMappings(profile, analysis),
            analysis.errors()
        );
    }

    private List<ImportFieldMappingResponse> fieldMappings(
        ImportProfile profile,
        IngestionAnalysis analysis
    ) {
        Map<String, String> configured = configuredMappings(profile);
        List<ImportFieldMappingResponse> response = new ArrayList<>();
        addField(response, "storeId", "Store ID", true, configured, analysis);
        addField(response, "receiptId", "Receipt ID", true, configured, analysis);
        addField(response, "timestamp", "Transaction time", true, configured, analysis);
        addField(response, "productCode", "Product code", false, configured, analysis);
        addField(response, "barcode", "Barcode", false, configured, analysis);
        addField(response, "productName", "Product name", true, configured, analysis);
        addField(response, "quantity", "Quantity", true, configured, analysis);
        addField(response, "unitPrice", "Unit price", true, configured, analysis);
        addField(response, "discountAmount", "Discount amount", true, configured, analysis);
        addField(response, "lineTotal", "Line total", true, configured, analysis);
        return List.copyOf(response);
    }

    private void addField(
        List<ImportFieldMappingResponse> response,
        String field,
        String label,
        boolean required,
        Map<String, String> configured,
        IngestionAnalysis analysis
    ) {
        String source = analysis.adapterMappings().containsKey(field)
            ? analysis.adapterMappings().get(field) : configured.get(field);
        String suggestion = suggest(field, source, analysis.sourceHeaders());
        response.add(new ImportFieldMappingResponse(field, label, required, source, suggestion));
    }

    private String suggest(String field, String configured, Set<String> headers) {
        if (configured != null && headers.contains(configured)) {
            return configured;
        }
        Map<String, String> normalizedHeaders = new LinkedHashMap<>();
        headers.forEach(header -> normalizedHeaders.put(normalize(header), header));
        for (String alias : COLUMN_ALIASES.getOrDefault(field, List.of())) {
            String match = normalizedHeaders.get(normalize(alias));
            if (match != null) return match;
        }
        return null;
    }

    private Map<String, String> configuredMappings(ImportProfile profile) {
        Map<String, String> mappings = new LinkedHashMap<>();
        mappings.put("storeId", profile.getStoreIdColumn());
        mappings.put("receiptId", profile.getReceiptIdColumn());
        mappings.put("timestamp", profile.getTimestampColumn());
        mappings.put("productCode", profile.getProductCodeColumn());
        mappings.put("barcode", profile.getBarcodeColumn());
        mappings.put("productName", profile.getProductNameColumn());
        mappings.put("quantity", profile.getQuantityColumn());
        mappings.put("unitPrice", profile.getUnitPriceColumn());
        mappings.put("discountAmount", profile.getDiscountAmountColumn());
        mappings.put("lineTotal", profile.getLineTotalColumn());
        return mappings;
    }

    private void validateMapping(UpdateImportMappingRequest request) {
        char delimiter = request.delimiter().charAt(0);
        if (delimiter == '\n' || delimiter == '\r') {
            throw new IllegalArgumentException("Delimiter must be one visible character");
        }
        try {
            DateTimeFormatter.ofPattern(clean(request.dateTimePattern()));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Timestamp pattern is not valid");
        }
        ColumnMappingRequest columns = request.columns();
        List<String> required = List.of(
            clean(columns.storeId()), clean(columns.receiptId()), clean(columns.timestamp()),
            clean(columns.productName()), clean(columns.quantity()), clean(columns.unitPrice()),
            clean(columns.discountAmount()), clean(columns.lineTotal())
        );
        if (new LinkedHashSet<>(required).size() != required.size()) {
            throw new IllegalArgumentException("Each required SCAN field must use a different source column");
        }
    }

    private void assertImportEnabled(Retailer retailer, ImportProfile profile) {
        if (!retailer.isTransactionImportEnabled()) {
            throw new IllegalArgumentException(
                retailer.getCode() + " does not accept transaction imports until onboarding is complete"
            );
        }
        if (!profile.getRetailer().getId().equals(retailer.getId())) {
            throw new IllegalArgumentException("Import profile does not belong to this retailer");
        }
        if (!profile.isValidated()) {
            throw new IllegalArgumentException("Import profile requires a successful sample validation");
        }
    }

    private ImportJobResponse fail(ImportJob job, int totalRows, List<String> errors) {
        String summary = String.join("\n", errors.stream().limit(100).toList());
        job.markFailed(totalRows, summary);
        importJobRepository.save(job);
        return ImportJobResponse.from(job, false, errors);
    }

    private List<String> existingErrors(ImportJob job) {
        if (job.getErrorSummary() == null || job.getErrorSummary().isBlank()) return List.of();
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
        if (originalFilename == null || originalFilename.isBlank()) return "upload";
        return Path.of(originalFilename.replace('\\', '/')).getFileName().toString();
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

    private String clean(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Required mapping value is missing");
        return value.trim();
    }

    private String optional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
    }

    private IngestionAnalysis emptyAnalysis() {
        return new IngestionAnalysis(
            "UNSUPPORTED", "No matching adapter", 0, Set.of(), Map.of(), List.of(),
            List.of("file: uploaded file is empty")
        );
    }

    private static Map<String, List<String>> aliases() {
        Map<String, List<String>> aliases = new LinkedHashMap<>();
        aliases.put("storeId", List.of("store_id", "store", "store code", "shop id", "obyekt_kodu"));
        aliases.put("receiptId", List.of("receipt_id", "receipt no", "receipt number", "çek_nömrəsi"));
        aliases.put("timestamp", List.of("transaction_timestamp", "timestamp", "date", "datetime", "çek_tarixi", "tarix"));
        aliases.put("productCode", List.of("product_code", "sku", "sku code", "məhsul_kodu"));
        aliases.put("barcode", List.of("barcode", "ean", "barkod"));
        aliases.put("productName", List.of("product_name", "product", "item", "məhsul_adı", "məhsul"));
        aliases.put("quantity", List.of("quantity", "qty", "miqdar"));
        aliases.put("unitPrice", List.of("unit_price", "price", "vahid_qiyməti_azn", "qiymət"));
        aliases.put("discountAmount", List.of("discount_amount", "discount", "sətir_endirimi_azn", "endirim"));
        aliases.put("lineTotal", List.of("line_total", "amount", "total", "sətir_məbləği_azn", "məbləğ"));
        return Map.copyOf(aliases);
    }
}
