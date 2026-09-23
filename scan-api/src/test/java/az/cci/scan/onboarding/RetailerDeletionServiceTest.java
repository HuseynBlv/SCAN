package az.cci.scan.onboarding;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.ScanAccount;
import az.cci.scan.importing.ImportService;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.ImportPreviewRepository;
import az.cci.scan.repository.OperationalAuditEventRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.ScanAccountRepository;
import az.cci.scan.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class RetailerDeletionServiceTest {

    @Autowired
    private RetailerDeletionService deletionService;

    @Autowired
    private ImportService importService;

    @Autowired
    private RetailerRepository retailerRepository;

    @Autowired
    private StoreRepository storeRepository;

    @Autowired
    private ImportProfileRepository importProfileRepository;

    @Autowired
    private ImportJobRepository importJobRepository;

    @Autowired
    private ImportPreviewRepository importPreviewRepository;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private RetailerProductRepository retailerProductRepository;

    @Autowired
    private ScanAccountRepository accountRepository;

    @Autowired
    private OperationalAuditEventRepository auditEventRepository;

    private Retailer target;
    private ScanAccount cciAccount;
    private Retailer otherRetailer;

    @BeforeEach
    void setUp() throws Exception {
        auditEventRepository.deleteAll();
        accountRepository.deleteAll();
        receiptRepository.deleteAll();
        retailerProductRepository.deleteAll();
        importJobRepository.deleteAll();
        importPreviewRepository.deleteAll();
        importProfileRepository.deleteAll();
        storeRepository.deleteAll();
        retailerRepository.deleteAll();

        target = retailerRepository.save(new Retailer("TOKILL", "Doomed Retailer", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(
            target, "CANONICAL", "synthetic-canonical-v1",
            "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
        importService.importFile("TOKILL", "CANONICAL", csv("""
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-01,R-1,2026-08-24T10:00:00,LOCAL-1,,Local Product,1,1.00,0.00,1.00
            """));
        accountRepository.save(new ScanAccount("tokill-retailer", "hash", ScanAccount.Role.RETAILER, target, null));
        cciAccount = accountRepository.save(new ScanAccount("shared-cci", "hash", ScanAccount.Role.CCI, null, null));
        cciAccount.grantRetailerAccess(target);
        accountRepository.save(cciAccount);

        otherRetailer = retailerRepository.save(new Retailer("SURVIVOR", "Untouched Retailer", "Asia/Baku", false));
        importProfileRepository.save(new ImportProfile(
            otherRetailer, "CANONICAL", "synthetic-canonical-v1",
            "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
        importService.importFile("SURVIVOR", "CANONICAL", csv("""
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-09,R-9,2026-08-24T10:00:00,SURVIVOR-1,,Survivor Product,1,2.00,0.00,2.00
            """));
    }

    @Test
    void deletesEveryRowTiedToTheRetailerAndLeavesAProvableTombstone() {
        var response = deletionService.delete(target.getId(), "tokill", null);

        assertThat(response.retailerCode()).isEqualTo("TOKILL");
        assertThat(response.deletedReceipts()).isEqualTo(1);
        assertThat(response.deletedTransactionLines()).isEqualTo(1);
        assertThat(response.deletedStores()).isEqualTo(1);
        assertThat(response.deletedImportProfiles()).isEqualTo(1);
        assertThat(response.deletedImportJobs()).isEqualTo(1);
        assertThat(response.deletedAccounts()).isEqualTo(1);

        assertThat(retailerRepository.findById(target.getId())).isEmpty();
        assertThat(storeRepository.count()).isEqualTo(1);
        assertThat(receiptRepository.count()).isEqualTo(1);
        assertThat(retailerProductRepository.count()).isEqualTo(1);
        assertThat(importProfileRepository.count()).isEqualTo(1);
        assertThat(importJobRepository.count()).isEqualTo(1);
        assertThat(accountRepository.findByUsernameIgnoreCase("tokill-retailer")).isEmpty();

        var survivingCci = accountRepository.findByUsernameIgnoreCase("shared-cci").orElseThrow();
        assertThat(survivingCci.getRetailerAccess())
            .as("the CCI account itself is never deleted, only its grant to the deleted retailer")
            .isEmpty();

        assertThat(retailerRepository.findByCodeIgnoreCase("SURVIVOR")).isPresent();
        assertThat(storeRepository.findAllByRetailerOrderByCreatedAtAsc(otherRetailer)).hasSize(1);
        assertThat(receiptRepository.findDistinctByRetailerOrderByTransactionTimestampAsc(otherRetailer)).hasSize(1);

        var tombstone = auditEventRepository.findAll().stream()
            .filter(event -> "RETAILER_DELETED".equals(event.getEventType()))
            .findFirst().orElseThrow();
        assertThat(tombstone.getRetailer())
            .as("the tombstone outlives the retailer it describes")
            .isNull();
        assertThat(tombstone.getSubjectId()).isEqualTo(target.getId().toString());
        assertThat(tombstone.getDetail()).contains("TOKILL").contains("1 receipt(s)").contains("1 account(s)");
    }

    @Test
    void refusesWithoutDeletingAnythingWhenTheConfirmationCodeDoesNotMatch() {
        assertThatThrownBy(() -> deletionService.delete(target.getId(), "WRONG-CODE", null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("did not match");

        assertThat(retailerRepository.findById(target.getId())).isPresent();
        assertThat(receiptRepository.count()).isEqualTo(2);
    }

    @Test
    void refusesToDeleteTheEnvironmentsBootstrapRetailerEvenWithTheCorrectCode() {
        Retailer bootstrapRetailer = retailerRepository.save(
            new Retailer("SHARED", "Bootstrap-bound retailer", "Asia/Baku", true)
        );

        assertThatThrownBy(() -> deletionService.delete(bootstrapRetailer.getId(), "SHARED", null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("bootstrap accounts are bound to it");
        assertThat(retailerRepository.findById(bootstrapRetailer.getId())).isPresent();
    }

    @Test
    void refusesToDeleteARetailerWithAnImportStillInProgress() {
        ImportProfile profile = importProfileRepository.findAllByRetailerOrderByCreatedAtAsc(target).getFirst();
        importJobRepository.save(new ImportJob(target, profile, "still-running.csv", "deadbeef", 1, "test"));

        assertThatThrownBy(() -> deletionService.delete(target.getId(), "TOKILL", null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("still in progress");
        assertThat(retailerRepository.findById(target.getId())).isPresent();
    }

    @Test
    void acceptsTheConfirmationCodeRegardlessOfCase() {
        var response = deletionService.delete(target.getId(), "  ToKiLL  ", null);
        assertThat(response.retailerCode()).isEqualTo("TOKILL");
    }

    private MockMultipartFile csv(String contents) {
        return new MockMultipartFile("file", "fixture.csv", "text/csv", contents.getBytes());
    }
}
