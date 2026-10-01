package az.cci.scan.intelligence;

import az.cci.scan.domain.FieldTask;
import az.cci.scan.domain.Investigation;
import az.cci.scan.domain.InvestigationHypothesis;
import az.cci.scan.repository.FieldTaskRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportPreviewRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.InvestigationRepository;
import az.cci.scan.repository.WatchlistItemRepository;
import az.cci.scan.repository.OperationalAuditEventRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerOfferActivationRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.ScanAccountRepository;
import az.cci.scan.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Proves a completed field task really does flow back into the investigation that requested it:
 * a system note with the real completion count, and - only when the checklist actually found the
 * matching kind of problem - a strengthened hypothesis, never a hypothesis nudged just because a
 * task happened to finish.
 */
@SpringBootTest
class FieldTaskServiceTest {

    @Autowired
    private FieldTaskService fieldTaskService;

    @Autowired
    private InvestigationService investigationService;

    @Autowired
    private InvestigationRepository investigationRepository;

    @Autowired
    private WatchlistItemRepository watchlistItemRepository;

    @Autowired
    private FieldTaskRepository fieldTaskRepository;

    @Autowired
    private RetailerOfferActivationRepository activationRepository;

    @Autowired
    private OperationalAuditEventRepository auditEventRepository;

    @Autowired
    private ScanAccountRepository accountRepository;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private RetailerProductRepository retailerProductRepository;

    @Autowired
    private ImportJobRepository importJobRepository;

    @Autowired
    private ImportPreviewRepository importPreviewRepository;

    @Autowired
    private ImportProfileRepository importProfileRepository;

    @Autowired
    private StoreRepository storeRepository;

    @Autowired
    private RetailerRepository retailerRepository;

    private az.cci.scan.domain.Retailer retailer;

    // This test class never touches most of these tables itself, but retailerRepository.deleteAll()
    // below is global (not scoped to this test's own retailer), and every SpringBootTest class in
    // the suite shares one H2 instance - any table with a retailer_id foreign key must be emptied
    // first or a leftover row from another test class breaks this cleanup with a FK violation.
    @BeforeEach
    void setUp() {
        fieldTaskRepository.deleteAll();
        watchlistItemRepository.deleteAll();
        investigationRepository.deleteAll();
        activationRepository.deleteAll();
        auditEventRepository.deleteAll();
        accountRepository.deleteAll();
        receiptRepository.deleteAll();
        retailerProductRepository.deleteAll();
        importJobRepository.deleteAll();
        importPreviewRepository.deleteAll();
        importProfileRepository.deleteAll();
        storeRepository.deleteAll();
        retailerRepository.deleteAll();
        retailer = retailerRepository.save(new az.cci.scan.domain.Retailer("FIELD", "Field Task Test Shop", "Asia/Baku", true));
    }

    @Test
    void createRejectsAnEmptyStoreList() {
        assertThatThrownBy(() -> fieldTaskService.create(
            retailer, null, "Check Sprite availability", "Availability may be an issue",
            "Field Sales Team", null, List.of(), "tester@example.com"
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void taskOnlyCompletesWhenEveryTargetStoreHasReported() {
        FieldTask task = fieldTaskService.create(
            retailer, null, "Check Sprite availability", "Basket presence dropped to zero in two stores",
            "Field Sales Team", null, List.of("STORE-A", "STORE-B"), "tester@example.com"
        );

        FieldTask afterFirst = fieldTaskService.recordResult(
            retailer, task.getId(), "STORE-A", false, true, true, false, "Empty shelf"
        );
        assertThat(afterFirst.getStatus()).isEqualTo(FieldTask.Status.OPEN);

        FieldTask afterSecond = fieldTaskService.recordResult(
            retailer, task.getId(), "STORE-B", true, true, true, false, null
        );
        assertThat(afterSecond.getStatus()).isEqualTo(FieldTask.Status.COMPLETED);
    }

    @Test
    void completedTaskWritesASystemNoteAndStrengthensTheMatchingHypothesis() {
        Investigation investigation = investigationService.openGeneral(
            retailer, "Sprite investigation", "Why did Sprite decline?", "tester@example.com"
        );
        investigation = investigationService.addHypothesis(
            retailer, investigation.getId(),
            "Availability issue: the product may not be consistently in stock.",
            "Basket presence dropped to near zero in Store A.",
            null,
            InvestigationHypothesis.Confidence.MEDIUM
        );
        InvestigationHypothesis availabilityHypothesis = investigation.getHypotheses().get(0);

        FieldTask task = fieldTaskService.create(
            retailer, investigation, "Check Sprite availability", "Basket presence dropped to zero",
            "Field Sales Team", null, List.of("STORE-A"), "tester@example.com"
        );
        fieldTaskService.recordResult(retailer, task.getId(), "STORE-A", false, true, true, false, "Shelf was empty");

        Investigation reloaded = investigationService.get(retailer, investigation.getId());
        assertThat(reloaded.getNotes()).anyMatch(note -> note.isSystem() && note.getBody().contains("1 of 1 stores reported an issue"));

        InvestigationHypothesis reloadedHypothesis = reloaded.getHypotheses().stream()
            .filter(h -> h.getId().equals(availabilityHypothesis.getId()))
            .findFirst()
            .orElseThrow();
        assertThat(reloadedHypothesis.getConfidence()).isEqualTo(InvestigationHypothesis.Confidence.HIGH);
        assertThat(reloadedHypothesis.getSupportingEvidence()).contains("Field check confirmed");
    }

    @Test
    void aCleanFieldCheckDoesNotStrengthenAnyHypothesis() {
        Investigation investigation = investigationService.openGeneral(
            retailer, "Sprite investigation", "Why did Sprite decline?", "tester@example.com"
        );
        investigation = investigationService.addHypothesis(
            retailer, investigation.getId(),
            "Availability issue: the product may not be consistently in stock.",
            "Basket presence dropped to near zero in Store A.",
            null,
            InvestigationHypothesis.Confidence.MEDIUM
        );

        FieldTask task = fieldTaskService.create(
            retailer, investigation, "Check Sprite availability", "Basket presence dropped to zero",
            "Field Sales Team", null, List.of("STORE-A"), "tester@example.com"
        );
        fieldTaskService.recordResult(retailer, task.getId(), "STORE-A", true, true, true, false, "All good");

        Investigation reloaded = investigationService.get(retailer, investigation.getId());
        assertThat(reloaded.getHypotheses().get(0).getConfidence()).isEqualTo(InvestigationHypothesis.Confidence.MEDIUM);
        assertThat(reloaded.getHypotheses().get(0).getSupportingEvidence()).doesNotContain("Field check confirmed");
        assertThat(reloaded.getNotes()).anyMatch(note -> note.isSystem() && note.getBody().contains("0 of 1 stores reported an issue"));
    }
}
