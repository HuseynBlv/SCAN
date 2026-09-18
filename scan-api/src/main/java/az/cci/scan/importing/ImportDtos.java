package az.cci.scan.importing;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;

import java.time.Instant;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class ImportDtos {

    private ImportDtos() {
    }

    public record ImportContextResponse(
        String retailerCode,
        String retailerName,
        String profileCode,
        String profileName,
        String sourceSystem,
        boolean importEnabled,
        boolean sampleValidated,
        boolean demoData,
        String delimiter,
        String dateTimePattern,
        String currency,
        ColumnMapping mapping
    ) {
        public static ImportContextResponse from(Retailer retailer, ImportProfile profile) {
            return new ImportContextResponse(
                retailer.getCode(),
                retailer.getName(),
                profile.getCode(),
                profile.getDisplayName(),
                profile.getSourceSystem(),
                retailer.isTransactionImportEnabled() && profile.isValidated(),
                profile.isValidated(),
                retailer.getCode().equals("KAGGLE") || retailer.getCode().equals("DEMO"),
                String.valueOf(profile.delimiterCharacter()),
                profile.getDateTimePattern(),
                profile.getCurrency(),
                ColumnMapping.from(profile)
            );
        }
    }

    public record ColumnMapping(
        String storeId,
        String receiptId,
        String timestamp,
        String productCode,
        String barcode,
        String productName,
        String quantity,
        String unitPrice,
        String discountAmount,
        String lineTotal
    ) {
        static ColumnMapping from(ImportProfile profile) {
            return new ColumnMapping(
                profile.getStoreIdColumn(),
                profile.getReceiptIdColumn(),
                profile.getTimestampColumn(),
                profile.getProductCodeColumn(),
                profile.getBarcodeColumn(),
                profile.getProductNameColumn(),
                profile.getQuantityColumn(),
                profile.getUnitPriceColumn(),
                profile.getDiscountAmountColumn(),
                profile.getLineTotalColumn()
            );
        }
    }

    public record UpdateImportMappingRequest(
        @NotNull @Size(min = 1, max = 1) String delimiter,
        @NotBlank @Size(max = 128) String dateTimePattern,
        @Valid @NotNull ColumnMappingRequest columns
    ) {
    }

    public record ColumnMappingRequest(
        @NotBlank @Size(max = 128) String storeId,
        @NotBlank @Size(max = 128) String receiptId,
        @NotBlank @Size(max = 128) String timestamp,
        @Size(max = 128) String productCode,
        @Size(max = 128) String barcode,
        @NotBlank @Size(max = 128) String productName,
        @NotBlank @Size(max = 128) String quantity,
        @NotBlank @Size(max = 128) String unitPrice,
        @NotBlank @Size(max = 128) String discountAmount,
        @NotBlank @Size(max = 128) String lineTotal
    ) {
    }

    public record ImportFieldMappingResponse(
        String field,
        String label,
        boolean required,
        String sourceColumn,
        String suggestedSourceColumn
    ) {
    }

    public record ImportPreviewResponse(
        UUID previewId,
        boolean readyForImport,
        boolean mappingRequired,
        String filename,
        String adapterCode,
        String adapterName,
        int rowsChecked,
        int receiptsDetected,
        int productLines,
        int distinctProducts,
        Set<String> detectedColumns,
        Set<String> detectedStoreIds,
        BigDecimal quantity,
        BigDecimal grossSales,
        BigDecimal discounts,
        BigDecimal reportedNetSales,
        BigDecimal calculatedNetSales,
        BigDecimal difference,
        String currency,
        Instant firstTransactionAt,
        Instant lastTransactionAt,
        Instant expiresAt,
        List<ImportFieldMappingResponse> fields,
        List<String> errors
    ) {
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
        String submittedBy,
        Instant createdAt,
        Instant startedAt,
        Instant updatedAt,
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
                job.getSubmittedBy(),
                job.getCreatedAt(),
                job.getStartedAt(),
                job.getUpdatedAt(),
                job.getCompletedAt()
            );
        }
    }

    public record ImportOperationsResponse(
        long queued,
        long validating,
        long importing,
        long failed,
        Instant oldestQueuedAt,
        Instant lastCompletedAt
    ) {
    }

    public record AuditEventResponse(
        UUID id,
        String actorUsername,
        String eventType,
        String subjectType,
        String subjectId,
        String detail,
        Instant occurredAt
    ) {
    }
}
