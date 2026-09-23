package az.cci.scan.onboarding;

import az.cci.scan.config.PilotAccessProperties;
import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Receipt;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.RetailerProduct;
import az.cci.scan.domain.ScanAccount;
import az.cci.scan.domain.Store;
import az.cci.scan.operations.AuditService;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportPreviewRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.OperationalAuditEventRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.ScanAccountRepository;
import az.cci.scan.repository.StoreRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static az.cci.scan.onboarding.OnboardingDtos.RetailerDeletionResponse;

/**
 * Permanently deletes a retailer and every row that exists only because of it - the opposite of
 * credential revocation, which disables access but keeps the data. This is for a retailer that
 * genuinely should never have existed (test/demo junk) or that explicitly asked to be forgotten,
 * not the default offboarding path. See RetailerDeletionServiceTest and the onboarding UI's
 * "Danger zone" copy for the reasoning behind each guard below.
 */
@Service
public class RetailerDeletionService {

    private static final Set<ImportJob.Status> IN_PROGRESS_STATUSES = EnumSet.of(
        ImportJob.Status.RECEIVED, ImportJob.Status.VALIDATING, ImportJob.Status.IMPORTING
    );

    private final RetailerRepository retailerRepository;
    private final StoreRepository storeRepository;
    private final ImportProfileRepository importProfileRepository;
    private final ImportJobRepository importJobRepository;
    private final ImportPreviewRepository importPreviewRepository;
    private final ReceiptRepository receiptRepository;
    private final RetailerProductRepository retailerProductRepository;
    private final ScanAccountRepository scanAccountRepository;
    private final OperationalAuditEventRepository auditEventRepository;
    private final PilotAccessProperties pilotAccessProperties;
    private final AuditService auditService;

    public RetailerDeletionService(
        RetailerRepository retailerRepository,
        StoreRepository storeRepository,
        ImportProfileRepository importProfileRepository,
        ImportJobRepository importJobRepository,
        ImportPreviewRepository importPreviewRepository,
        ReceiptRepository receiptRepository,
        RetailerProductRepository retailerProductRepository,
        ScanAccountRepository scanAccountRepository,
        OperationalAuditEventRepository auditEventRepository,
        PilotAccessProperties pilotAccessProperties,
        AuditService auditService
    ) {
        this.retailerRepository = retailerRepository;
        this.storeRepository = storeRepository;
        this.importProfileRepository = importProfileRepository;
        this.importJobRepository = importJobRepository;
        this.importPreviewRepository = importPreviewRepository;
        this.receiptRepository = receiptRepository;
        this.retailerProductRepository = retailerProductRepository;
        this.scanAccountRepository = scanAccountRepository;
        this.auditEventRepository = auditEventRepository;
        this.pilotAccessProperties = pilotAccessProperties;
        this.auditService = auditService;
    }

    @Transactional
    public RetailerDeletionResponse delete(UUID retailerId, String confirmRetailerCode, Authentication authentication) {
        // Locking here also means a background import that is mid-write for this retailer (which
        // takes the same lock in ImportPersistenceService) is waited out rather than raced: either
        // it finishes and this delete removes what it wrote, or this delete commits first and the
        // import resumes to find its retailer gone and fails cleanly, never a half-written mix.
        Retailer retailer = retailerRepository.findLockedById(retailerId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown retailer: " + retailerId));

        if (retailer.getCode().equalsIgnoreCase(pilotAccessProperties.retailerCode())) {
            throw new IllegalArgumentException(
                "Cannot delete " + retailer.getCode() + ": this deployment's bootstrap accounts are bound to it"
            );
        }
        if (confirmRetailerCode == null || !confirmRetailerCode.trim().equalsIgnoreCase(retailer.getCode())) {
            throw new IllegalArgumentException(
                "Confirmation code did not match this retailer's code; nothing was deleted"
            );
        }
        boolean importInProgress = IN_PROGRESS_STATUSES.stream()
            .anyMatch(status -> importJobRepository.countByRetailerAndStatus(retailer, status) > 0);
        if (importInProgress) {
            throw new IllegalArgumentException(
                "An import is still in progress for this retailer; wait for it to finish before deleting"
            );
        }

        String code = retailer.getCode();
        String name = retailer.getName();

        importPreviewRepository.deleteAll(importPreviewRepository.findAllByRetailer(retailer));

        List<Receipt> receipts = receiptRepository.findDistinctByRetailerOrderByTransactionTimestampAsc(retailer);
        int deletedTransactionLines = receipts.stream().mapToInt(receipt -> receipt.getLines().size()).sum();
        receiptRepository.deleteAll(receipts);

        List<RetailerProduct> retailerProducts = retailerProductRepository.findAllByRetailer(retailer);
        retailerProductRepository.deleteAll(retailerProducts);

        // Retailer-bound accounts (RETAILER/ADMIN/INGEST) are deleted outright, unlike a CCI
        // account, which is never retailer-bound and is never touched here: only its grant to see
        // this one retailer is revoked, explicitly (see ScanAccount.revokeRetailerAccess) rather
        // than left to a database-level cascade, since that clause exists in the real schema but
        // not in the one Hibernate generates for tests, and this must behave the same in both.
        for (ScanAccount cciAccount : scanAccountRepository.findAllByRole(ScanAccount.Role.CCI)) {
            cciAccount.revokeRetailerAccess(retailer);
        }
        List<ScanAccount> accounts = scanAccountRepository.findAllByRetailerOrderByCreatedAtAsc(retailer);
        scanAccountRepository.deleteAll(accounts);

        List<ImportJob> jobs = importJobRepository.findAllByRetailerOrderByCreatedAtDesc(retailer, Pageable.unpaged());
        importJobRepository.deleteAll(jobs);

        List<ImportProfile> profiles = importProfileRepository.findAllByRetailerOrderByCreatedAtAsc(retailer);
        importProfileRepository.deleteAll(profiles);

        List<Store> stores = storeRepository.findAllByRetailerOrderByCreatedAtAsc(retailer);
        storeRepository.deleteAll(stores);

        // This retailer's own audit history goes too - it's squarely part of "its data" - but a
        // single new record survives with no retailer attached, so the deletion itself stays
        // provable after the retailer it describes no longer exists.
        auditEventRepository.deleteAll(auditEventRepository.findAllByRetailer(retailer));

        retailerRepository.delete(retailer);

        RetailerDeletionResponse response = new RetailerDeletionResponse(
            code,
            name,
            stores.size(),
            profiles.size(),
            jobs.size(),
            receipts.size(),
            deletedTransactionLines,
            retailerProducts.size(),
            accounts.size(),
            Instant.now()
        );

        auditService.record(
            null, authentication, "RETAILER_DELETED", "RETAILER", retailerId.toString(),
            "Deleted " + name + " (" + code + "): " + stores.size() + " store(s), " + profiles.size()
                + " import profile(s), " + jobs.size() + " import job(s), " + receipts.size()
                + " receipt(s), " + deletedTransactionLines + " line(s), " + retailerProducts.size()
                + " product mapping(s), " + accounts.size() + " account(s)"
        );

        return response;
    }
}
