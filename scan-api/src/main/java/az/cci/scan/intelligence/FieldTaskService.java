package az.cci.scan.intelligence;

import az.cci.scan.domain.FieldTask;
import az.cci.scan.domain.FieldTaskStore;
import az.cci.scan.domain.Investigation;
import az.cci.scan.domain.InvestigationHypothesis;
import az.cci.scan.domain.InvestigationNote;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.FieldTaskRepository;
import az.cci.scan.repository.InvestigationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * The bridge from insight to execution: creates a field task against named stores with the fixed
 * availability/placement/competitor checklist, records what a field rep actually found, and - the
 * part that gives SCAN "institutional memory" - writes completed results back into the
 * investigation that requested them, as a system-authored note, and strengthens a matching
 * hypothesis when the evidence supports it.
 */
@Service
public class FieldTaskService {

    private final FieldTaskRepository fieldTaskRepository;
    private final InvestigationRepository investigationRepository;

    FieldTaskService(FieldTaskRepository fieldTaskRepository, InvestigationRepository investigationRepository) {
        this.fieldTaskRepository = fieldTaskRepository;
        this.investigationRepository = investigationRepository;
    }

    @Transactional
    public FieldTask create(
        Retailer retailer,
        Investigation investigation,
        String title,
        String reason,
        String assignedTo,
        Instant dueAt,
        List<String> externalStoreIds,
        String createdBy
    ) {
        if (externalStoreIds == null || externalStoreIds.isEmpty()) {
            throw new IllegalArgumentException("A field task needs at least one target store");
        }
        FieldTask task = new FieldTask(retailer, investigation, title, reason, assignedTo, dueAt, createdBy);
        externalStoreIds.forEach(storeId -> task.addStore(new FieldTaskStore(task, storeId)));
        return fieldTaskRepository.save(task);
    }

    public FieldTask get(Retailer retailer, UUID taskId) {
        return fieldTaskRepository.findByIdAndRetailer(taskId, retailer)
            .orElseThrow(() -> new IllegalArgumentException("Unknown field task: " + taskId));
    }

    public List<FieldTask> list(Retailer retailer) {
        return fieldTaskRepository.findAllByRetailerOrderByCreatedAtDesc(retailer);
    }

    public List<FieldTask> listForInvestigation(Investigation investigation) {
        return fieldTaskRepository.findAllByInvestigationOrderByCreatedAtDesc(investigation);
    }

    /**
     * Records one store's checklist result. When this completes the task (every target store has
     * reported), the result is summarized back into the linked investigation - real evidence
     * changing what's known, not a guess about what the field probably found.
     */
    @Transactional
    public FieldTask recordResult(
        Retailer retailer,
        UUID taskId,
        String externalStoreId,
        boolean stockAvailable,
        boolean visibleInCooler,
        boolean correctPlacement,
        boolean competitorPresent,
        String note
    ) {
        FieldTask task = get(retailer, taskId);
        FieldTaskStore store = task.getStores().stream()
            .filter(s -> s.getExternalStoreId().equals(externalStoreId))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Store is not a target of this field task: " + externalStoreId));

        store.recordResult(stockAvailable, visibleInCooler, correctPlacement, competitorPresent, note);
        boolean wasComplete = task.getStatus() == FieldTask.Status.COMPLETED;
        task.refreshCompletion();

        if (!wasComplete && task.getStatus() == FieldTask.Status.COMPLETED && task.getInvestigation() != null) {
            reflectIntoInvestigation(task);
        }
        return task;
    }

    private void reflectIntoInvestigation(FieldTask task) {
        Investigation investigation = investigationRepository.findByIdAndRetailer(task.getInvestigation().getId(), task.getRetailer())
            .orElse(null);
        if (investigation == null) {
            return;
        }

        long issueCount = task.getStores().stream().filter(FieldTaskStore::hasIssue).count();
        long total = task.getStores().size();
        String summary = String.format(Locale.ROOT,
            "Field check \"%s\" completed: %d of %d stores reported an issue (out of stock, not visible, or wrong placement).",
            task.getTitle(), issueCount, total
        );
        investigation.addNote(new InvestigationNote(investigation, "SCAN", summary, true));

        if (issueCount > 0) {
            boolean anyOutOfStock = task.getStores().stream()
                .anyMatch(s -> Boolean.FALSE.equals(s.getStockAvailable()));
            boolean anyPlacementIssue = task.getStores().stream()
                .anyMatch(s -> Boolean.FALSE.equals(s.getVisibleInCooler()) || Boolean.FALSE.equals(s.getCorrectPlacement()));

            for (InvestigationHypothesis hypothesis : investigation.getHypotheses()) {
                if (hypothesis.getStatus() != InvestigationHypothesis.Status.OPEN) {
                    continue;
                }
                boolean isAvailabilityHypothesis = matchesAvailability(hypothesis.getStatement());
                boolean isExecutionHypothesis = matchesExecution(hypothesis.getStatement());
                if ((isAvailabilityHypothesis && anyOutOfStock) || (isExecutionHypothesis && anyPlacementIssue)) {
                    hypothesis.strengthen(
                        hypothesis.getSupportingEvidence() + " Field check confirmed: " + issueCount + " of " + total + " visited stores had a real issue.",
                        InvestigationHypothesis.Confidence.HIGH
                    );
                }
            }
        }

        investigation.markInProgress();
    }

    private static boolean matchesAvailability(String statement) {
        return statement.toLowerCase(Locale.ROOT).contains("vailability");
    }

    private static boolean matchesExecution(String statement) {
        String lower = statement.toLowerCase(Locale.ROOT);
        return lower.contains("placement") || lower.contains("execution");
    }
}
