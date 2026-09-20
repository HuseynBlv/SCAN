package az.cci.scan.onboarding;

import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.ScanAccount;
import az.cci.scan.domain.Store;
import az.cci.scan.importing.IngestionAnalysis;
import az.cci.scan.importing.TransactionIngestionAnalyzer;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.ScanAccountRepository;
import az.cci.scan.repository.StoreRepository;
import az.cci.scan.operations.AuditService;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Currency;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import static az.cci.scan.onboarding.OnboardingDtos.ColumnMappingRequest;
import static az.cci.scan.onboarding.OnboardingDtos.CreateImportProfileRequest;
import static az.cci.scan.onboarding.OnboardingDtos.CreateRetailerRequest;
import static az.cci.scan.onboarding.OnboardingDtos.CreateStoreRequest;
import static az.cci.scan.onboarding.OnboardingDtos.ImportProfileResponse;
import static az.cci.scan.onboarding.OnboardingDtos.IssuedCredential;
import static az.cci.scan.onboarding.OnboardingDtos.IssuedCredentialsResponse;
import static az.cci.scan.onboarding.OnboardingDtos.RetailerOnboardingResponse;
import static az.cci.scan.onboarding.OnboardingDtos.SampleValidationResponse;
import static az.cci.scan.onboarding.OnboardingDtos.StoreResponse;
import static az.cci.scan.onboarding.OnboardingDtos.CredentialResponse;
import static az.cci.scan.onboarding.OnboardingDtos.RotatedCredentialResponse;

@Service
public class OnboardingService {

    private static final Pattern SAFE_CODE = Pattern.compile("[^A-Z0-9]+");
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final RetailerRepository retailerRepository;
    private final StoreRepository storeRepository;
    private final ImportProfileRepository importProfileRepository;
    private final ScanAccountRepository accountRepository;
    private final PasswordEncoder passwordEncoder;
    private final TransactionIngestionAnalyzer analyzer;
    private final AuditService auditService;

    public OnboardingService(
        RetailerRepository retailerRepository,
        StoreRepository storeRepository,
        ImportProfileRepository importProfileRepository,
        ScanAccountRepository accountRepository,
        PasswordEncoder passwordEncoder,
        TransactionIngestionAnalyzer analyzer,
        AuditService auditService
    ) {
        this.retailerRepository = retailerRepository;
        this.storeRepository = storeRepository;
        this.importProfileRepository = importProfileRepository;
        this.accountRepository = accountRepository;
        this.passwordEncoder = passwordEncoder;
        this.analyzer = analyzer;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<RetailerOnboardingResponse> retailers() {
        return retailerRepository.findAll().stream()
            .sorted(java.util.Comparator.comparing(Retailer::getCreatedAt).reversed())
            .map(this::response)
            .toList();
    }

    @Transactional
    public RetailerOnboardingResponse createRetailer(CreateRetailerRequest request) {
        ZoneId zone = validZone(request.zoneId());
        Retailer retailer = retailerRepository.save(new Retailer(
            generatedCode(request.name()),
            clean(request.name()),
            zone.getId(),
            false,
            false
        ));
        Set<String> externalIds = new LinkedHashSet<>();
        for (CreateStoreRequest store : request.stores()) {
            String externalId = clean(store.externalStoreId());
            if (!externalIds.add(externalId)) {
                throw new IllegalArgumentException("Store IDs must be unique within a retailer");
            }
            storeRepository.save(new Store(retailer, externalId, clean(store.name())));
        }
        return response(retailer);
    }

    @Transactional
    public StoreResponse createStore(UUID retailerId, CreateStoreRequest request) {
        Retailer retailer = retailer(retailerId);
        String externalId = clean(request.externalStoreId());
        if (storeRepository.findByRetailerAndExternalStoreId(retailer, externalId).isPresent()) {
            throw new IllegalArgumentException("This store ID is already registered for the retailer");
        }
        return StoreResponse.from(storeRepository.save(new Store(
            retailer,
            externalId,
            clean(request.name())
        )));
    }

    @Transactional
    public ImportProfileResponse createProfile(UUID retailerId, CreateImportProfileRequest request) {
        Retailer retailer = retailer(retailerId);
        validateProfile(request, retailer.getZoneId());
        ColumnMappingRequest columns = request.columns();
        ImportProfile profile = ImportProfile.draft(
            retailer,
            generatedProfileCode(),
            clean(request.name()),
            clean(request.sourceSystem()),
            request.delimiter().charAt(0),
            clean(request.dateTimePattern()),
            retailer.getZoneId(),
            request.currency().trim().toUpperCase(Locale.ROOT),
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
        return ImportProfileResponse.from(importProfileRepository.save(profile));
    }

    @Transactional
    public SampleValidationResponse validateSample(
        UUID retailerId,
        UUID profileId,
        MultipartFile file
    ) {
        Retailer retailer = retailer(retailerId);
        ImportProfile profile = profile(retailer, profileId);
        String filename = safeFilename(file.getOriginalFilename());
        byte[] bytes = readBytes(file);
        if (bytes.length == 0) {
            return invalidSample(filename, 0, Set.of(), List.of("file: uploaded file is empty"));
        }
        try {
            IngestionAnalysis analysis = analyzer.analyzeForPreview(retailer, profile, filename, bytes);
            IngestionAnalysis.Reconciliation totals = analysis.reconciliation();
            if (!analysis.valid()) {
                return new SampleValidationResponse(
                    false,
                    filename,
                    analysis.sourceRows(),
                    0,
                    totals.productLines(),
                    analysis.sourceHeaders(),
                    totals.storeIds(),
                    analysis.errors(),
                    null
                );
            }
            profile.markValidated();
            retailer.enableTransactionImports();
            importProfileRepository.save(profile);
            retailerRepository.save(retailer);
            return new SampleValidationResponse(
                true,
                filename,
                analysis.sourceRows(),
                totals.receipts(),
                totals.productLines(),
                analysis.sourceHeaders(),
                totals.storeIds(),
                List.of(),
                profile.getValidatedAt()
            );
        } catch (RuntimeException exception) {
            String message = exception.getMessage();
            return invalidSample(
                filename,
                0,
                Set.of(),
                List.of(message == null || message.isBlank() ? "Unable to read this sample" : message)
            );
        }
    }

    @Transactional
    public IssuedCredentialsResponse issueCredentials(
        UUID retailerId,
        UUID profileId,
        Authentication authentication
    ) {
        Retailer retailer = retailer(retailerId);
        ImportProfile profile = profile(retailer, profileId);
        if (!profile.isValidated() || !retailer.isTransactionImportEnabled()) {
            throw new IllegalArgumentException("Validate a sample export before issuing credentials");
        }
        if (accountRepository.existsByRetailer(retailer)) {
            throw new IllegalArgumentException("Credentials have already been issued for this retailer");
        }
        String prefix = retailer.getCode().toLowerCase(Locale.ROOT).replace('_', '-');
        List<IssuedCredential> credentials = List.of(
            credential("Retailer workspace", prefix + "-owner", ScanAccount.Role.RETAILER, retailer, null),
            credential("Data connection", prefix + "-admin", ScanAccount.Role.ADMIN, retailer, profile),
            credential("POS connector", prefix + "-connector", ScanAccount.Role.INGEST, retailer, profile)
        );
        IssuedCredentialsResponse response = new IssuedCredentialsResponse(
            retailer.getCode(),
            profile.getDisplayName(),
            Instant.now(),
            credentials
        );
        auditService.record(
            retailer, authentication, "CREDENTIALS_ISSUED", "RETAILER",
            retailer.getId().toString(), "Three tenant-bound credentials issued"
        );
        return response;
    }

    public IssuedCredentialsResponse issueCredentials(UUID retailerId, UUID profileId) {
        return issueCredentials(retailerId, profileId, null);
    }

    @Transactional
    public RetailerOnboardingResponse updateCciSharing(
        UUID retailerId,
        boolean enabled,
        Authentication authentication
    ) {
        Retailer retailer = retailer(retailerId);
        if (retailer.isCciSharingEnabled() != enabled) {
            retailer.setCciSharingEnabled(enabled);
            retailerRepository.save(retailer);
            if (enabled) {
                // CCI HQ accounts aren't bound to a retailer at creation time (they can read
                // every retailer that has opted in), so newly-enabled sharing has to grant
                // every existing CCI account access, not just the one from bootstrap.
                for (ScanAccount cciAccount : accountRepository.findAllByRole(ScanAccount.Role.CCI)) {
                    cciAccount.grantRetailerAccess(retailer);
                    accountRepository.save(cciAccount);
                }
            }
            auditService.record(
                retailer, authentication, enabled ? "CCI_SHARING_ENABLED" : "CCI_SHARING_DISABLED",
                "RETAILER", retailer.getId().toString(),
                enabled ? "CCI HQ can now read this retailer's aggregate analytics" : "CCI HQ access revoked"
            );
        }
        return response(retailer);
    }

    @Transactional(readOnly = true)
    public List<CredentialResponse> credentials(UUID retailerId) {
        Retailer retailer = retailer(retailerId);
        return accountRepository.findAllByRetailerOrderByCreatedAtAsc(retailer).stream()
            .map(CredentialResponse::from)
            .toList();
    }

    @Transactional
    public RotatedCredentialResponse rotateCredential(
        UUID retailerId,
        UUID accountId,
        Authentication authentication
    ) {
        Retailer retailer = retailer(retailerId);
        ScanAccount account = accountRepository.findByIdAndRetailer(accountId, retailer)
            .orElseThrow(() -> new IllegalArgumentException("Unknown credential for this retailer"));
        if (!account.isEnabled()) {
            throw new IllegalArgumentException("Revoked credentials cannot be rotated");
        }
        String password = generatedPassword();
        account.rotatePassword(passwordEncoder.encode(password));
        accountRepository.saveAndFlush(account);
        auditService.record(
            retailer, authentication, "CREDENTIAL_ROTATED", "SCAN_ACCOUNT",
            account.getId().toString(), account.getUsername()
        );
        return new RotatedCredentialResponse(CredentialResponse.from(account), password);
    }

    @Transactional
    public CredentialResponse revokeCredential(
        UUID retailerId,
        UUID accountId,
        Authentication authentication
    ) {
        Retailer retailer = retailer(retailerId);
        ScanAccount account = accountRepository.findByIdAndRetailer(accountId, retailer)
            .orElseThrow(() -> new IllegalArgumentException("Unknown credential for this retailer"));
        if (account.isEnabled()) {
            account.revoke();
            accountRepository.saveAndFlush(account);
            auditService.record(
                retailer, authentication, "CREDENTIAL_REVOKED", "SCAN_ACCOUNT",
                account.getId().toString(), account.getUsername()
            );
        }
        return CredentialResponse.from(account);
    }

    private IssuedCredential credential(
        String purpose,
        String username,
        ScanAccount.Role role,
        Retailer retailer,
        ImportProfile profile
    ) {
        String password = generatedPassword();
        accountRepository.save(new ScanAccount(
            username,
            passwordEncoder.encode(password),
            role,
            retailer,
            profile
        ));
        return new IssuedCredential(purpose, username, password);
    }

    private RetailerOnboardingResponse response(Retailer retailer) {
        return RetailerOnboardingResponse.from(
            retailer,
            accountRepository.existsByRetailer(retailer),
            storeRepository.findAllByRetailerOrderByCreatedAtAsc(retailer),
            importProfileRepository.findAllByRetailerOrderByCreatedAtAsc(retailer)
        );
    }

    private Retailer retailer(UUID retailerId) {
        return retailerRepository.findById(retailerId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown retailer"));
    }

    private ImportProfile profile(Retailer retailer, UUID profileId) {
        return importProfileRepository.findByIdAndRetailer(profileId, retailer)
            .orElseThrow(() -> new IllegalArgumentException("Unknown import format for this retailer"));
    }

    private void validateProfile(CreateImportProfileRequest request, String zoneId) {
        if (request.columns() == null) {
            throw new IllegalArgumentException("Column mapping is required");
        }
        if (request.delimiter().charAt(0) == '\n' || request.delimiter().charAt(0) == '\r') {
            throw new IllegalArgumentException("Delimiter must be one visible character");
        }
        validZone(zoneId);
        try {
            Currency.getInstance(request.currency().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Currency must be a valid three-letter ISO code");
        }
        try {
            DateTimeFormatter.ofPattern(clean(request.dateTimePattern()));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Timestamp pattern is not valid");
        }
        ColumnMappingRequest columns = request.columns();
        List<String> required = List.of(
            clean(columns.storeId()),
            clean(columns.receiptId()),
            clean(columns.timestamp()),
            clean(columns.productName()),
            clean(columns.quantity()),
            clean(columns.unitPrice()),
            clean(columns.discountAmount()),
            clean(columns.lineTotal())
        );
        if (new LinkedHashSet<>(required).size() != required.size()) {
            throw new IllegalArgumentException("Each required SCAN field must use a different source column");
        }
    }

    private ZoneId validZone(String value) {
        try {
            return ZoneId.of(clean(value));
        } catch (DateTimeException exception) {
            throw new IllegalArgumentException("Time zone is not valid");
        }
    }

    private String generatedCode(String name) {
        String mapped = clean(name)
            .replace('Ə', 'E')
            .replace('ə', 'e')
            .toUpperCase(Locale.ROOT);
        String stem = SAFE_CODE.matcher(mapped).replaceAll("_").replaceAll("^_+|_+$", "");
        if (stem.isBlank()) {
            stem = "RETAILER";
        }
        if (stem.length() > 40) {
            stem = stem.substring(0, 40).replaceAll("_+$", "");
        }
        return stem + "_" + UUID.randomUUID().toString().substring(0, 6).toUpperCase(Locale.ROOT);
    }

    private String generatedProfileCode() {
        return "FORMAT_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
    }

    private String generatedPassword() {
        byte[] bytes = new byte[24];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String clean(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Required onboarding value is missing");
        }
        return value.trim();
    }

    private String optional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException exception) {
            throw new IllegalArgumentException("Unable to read uploaded sample", exception);
        }
    }

    private String safeFilename(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return "sample";
        }
        return Path.of(originalFilename.replace('\\', '/')).getFileName().toString();
    }

    private SampleValidationResponse invalidSample(
        String filename,
        int rows,
        Set<String> columns,
        List<String> errors
    ) {
        return new SampleValidationResponse(
            false,
            filename,
            rows,
            0,
            0,
            columns,
            Set.of(),
            List.copyOf(errors),
            null
        );
    }
}
