package az.cci.scan.onboarding;

import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.Store;
import az.cci.scan.domain.ScanAccount;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class OnboardingDtos {

    private OnboardingDtos() {
    }

    public record OnboardingContextResponse(String operatorUsername) {
    }

    public record CreateStoreRequest(
        @NotBlank @Size(max = 128) String externalStoreId,
        @NotBlank @Size(max = 255) String name
    ) {
    }

    public record CreateRetailerRequest(
        @NotBlank @Size(max = 255) String name,
        @NotBlank @Size(max = 64) String zoneId,
        @NotEmpty @Size(max = 100) List<@Valid CreateStoreRequest> stores
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

    public record CreateImportProfileRequest(
        @NotBlank @Size(max = 128) String name,
        @NotBlank @Size(max = 128) String sourceSystem,
        @NotNull @Size(min = 1, max = 1) String delimiter,
        @NotBlank @Size(max = 128) String dateTimePattern,
        @NotBlank @Size(max = 3) String currency,
        @Valid ColumnMappingRequest columns
    ) {
    }

    public record StoreResponse(UUID id, String externalStoreId, String name) {
        static StoreResponse from(Store store) {
            return new StoreResponse(store.getId(), store.getExternalStoreId(), store.getName());
        }
    }

    public record ImportProfileResponse(
        UUID id,
        String code,
        String name,
        String sourceSystem,
        String validationStatus,
        Instant validatedAt
    ) {
        static ImportProfileResponse from(ImportProfile profile) {
            return new ImportProfileResponse(
                profile.getId(),
                profile.getCode(),
                profile.getDisplayName(),
                profile.getSourceSystem(),
                profile.getValidationStatus().name(),
                profile.getValidatedAt()
            );
        }
    }

    public record RetailerOnboardingResponse(
        UUID id,
        String code,
        String name,
        String zoneId,
        boolean importEnabled,
        boolean credentialsIssued,
        boolean cciSharingEnabled,
        List<StoreResponse> stores,
        List<ImportProfileResponse> importProfiles
    ) {
        static RetailerOnboardingResponse from(
            Retailer retailer,
            boolean credentialsIssued,
            List<Store> stores,
            List<ImportProfile> profiles
        ) {
            return new RetailerOnboardingResponse(
                retailer.getId(),
                retailer.getCode(),
                retailer.getName(),
                retailer.getZoneId(),
                retailer.isTransactionImportEnabled(),
                credentialsIssued,
                retailer.isCciSharingEnabled(),
                stores.stream().map(StoreResponse::from).toList(),
                profiles.stream().map(ImportProfileResponse::from).toList()
            );
        }
    }

    public record UpdateCciSharingRequest(boolean enabled) {
    }

    public record SampleValidationResponse(
        boolean valid,
        String filename,
        int rowsChecked,
        int receiptsDetected,
        int productLines,
        Set<String> detectedColumns,
        Set<String> detectedStoreIds,
        List<String> errors,
        Instant validatedAt
    ) {
    }

    public record IssuedCredential(
        String purpose,
        String username,
        String password
    ) {
    }

    public record IssuedCredentialsResponse(
        String retailerCode,
        String profileName,
        Instant issuedAt,
        List<IssuedCredential> credentials
    ) {
    }

    public record CredentialResponse(
        UUID id,
        String purpose,
        String username,
        String role,
        boolean enabled,
        Instant createdAt,
        Instant lastRotatedAt,
        Instant revokedAt
    ) {
        static CredentialResponse from(ScanAccount account) {
            return new CredentialResponse(
                account.getId(), purpose(account.getRole()), account.getUsername(),
                account.getRole().name(), account.isEnabled(), account.getCreatedAt(),
                account.getLastRotatedAt(), account.getRevokedAt()
            );
        }

        private static String purpose(ScanAccount.Role role) {
            return switch (role) {
                case RETAILER -> "Retailer workspace";
                case ADMIN -> "Data connection";
                case INGEST -> "POS connector";
                default -> role.name();
            };
        }
    }

    public record RotatedCredentialResponse(CredentialResponse credential, String password) {
    }

    public record DeleteRetailerRequest(@NotBlank String confirmRetailerCode) {
    }

    public record RetailerDeletionResponse(
        String retailerCode,
        String retailerName,
        int deletedStores,
        int deletedImportProfiles,
        int deletedImportJobs,
        int deletedReceipts,
        int deletedTransactionLines,
        int deletedRetailerProducts,
        int deletedAccounts,
        Instant deletedAt
    ) {
    }
}
