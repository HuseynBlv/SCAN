package az.cci.scan.intelligence;

import az.cci.scan.domain.FieldTask;
import az.cci.scan.domain.Investigation;
import az.cci.scan.domain.Retailer;
import az.cci.scan.intelligence.ChangeDetectionDtos.NetworkChange;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
import az.cci.scan.intelligence.MeetingBriefDtos.MeetingBriefResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * "Prepare Weekly Sales Review" and the rest of the meeting templates, as a prototype: one real,
 * computed summary reused across every template name. The templates do not yet change what gets
 * computed (that needs the role-aware personalization this codebase defers to Phase 2) - they
 * only label the same real brief for the meeting it's headed to. A PPT/PDF export and a stored
 * "what did we say last time" comparison both need work this class does not do yet; see
 * {@code limitations} in the response for what's explicitly out of scope today.
 */
@Service
public class MeetingBriefService {

    private static final int TOP_MOVERS_LIMIT = 3;

    private final ChangeDetectionService changeDetectionService;
    private final InvestigationService investigationService;
    private final FieldTaskService fieldTaskService;

    MeetingBriefService(
        ChangeDetectionService changeDetectionService,
        InvestigationService investigationService,
        FieldTaskService fieldTaskService
    ) {
        this.changeDetectionService = changeDetectionService;
        this.investigationService = investigationService;
        this.fieldTaskService = fieldTaskService;
    }

    @Transactional(readOnly = true)
    public MeetingBriefResponse prepare(Retailer retailer, String template, int periodDays) {
        NetworkChange network = changeDetectionService.networkChange(retailer, periodDays);
        String networkSummary = String.format(Locale.ROOT,
            "CCI products appeared in %.1f%% of baskets over the last %d days, vs. %.1f%% in the prior %d days (%+.1f points).",
            network.recentPenetrationPct(), periodDays, network.priorPenetrationPct(), periodDays,
            network.penetrationPointChange()
        );

        List<Investigation> openInvestigations = investigationService.list(retailer, true);
        List<String> issues = openInvestigations.stream()
            .map(investigation -> String.format(Locale.ROOT,
                "%s (%s) - %d open hypothesis(es)",
                investigation.getTitle(), investigation.getStatus(),
                investigation.getHypotheses().stream()
                    .filter(h -> h.getStatus() == az.cci.scan.domain.InvestigationHypothesis.Status.OPEN)
                    .count()
            ))
            .toList();

        List<FieldTask> allTasks = fieldTaskService.list(retailer);
        Instant recentCutoff = Instant.now().minus(periodDays, ChronoUnit.DAYS);
        long openTaskCount = allTasks.stream().filter(t -> t.getStatus() == FieldTask.Status.OPEN).count();
        List<String> fieldExecution = new java.util.ArrayList<>();
        if (openTaskCount > 0) {
            fieldExecution.add(openTaskCount + " field check(s) still awaiting results.");
        }
        List<FieldTask> recentlyCompleted = allTasks.stream()
            .filter(t -> t.getStatus() == FieldTask.Status.COMPLETED && t.getUpdatedAt().isAfter(recentCutoff))
            .toList();
        recentlyCompleted.forEach(task -> {
            long issueCount = task.getStores().stream().filter(az.cci.scan.domain.FieldTaskStore::hasIssue).count();
            fieldExecution.add(String.format(Locale.ROOT,
                "\"%s\" completed: %d of %d store(s) had an issue.", task.getTitle(), issueCount, task.getStores().size()
            ));
        });
        if (fieldExecution.isEmpty()) {
            fieldExecution.add("No field checks were created or completed in this window.");
        }

        List<Investigation> allInvestigations = investigationService.list(retailer, false);
        List<String> completedActions = allInvestigations.stream()
            .filter(investigation -> investigation.getStatus() == Investigation.Status.CLOSED
                && investigation.getClosedAt() != null && investigation.getClosedAt().isAfter(recentCutoff))
            .map(Investigation::getTitle)
            .toList();

        List<ProductMover> movers = changeDetectionService.biggestDecliners(retailer, periodDays, Integer.MAX_VALUE);
        List<String> risks = movers.stream()
            .filter(m -> m.basketChangePct() < 0)
            .limit(TOP_MOVERS_LIMIT)
            .map(MeetingBriefService::describeMover)
            .toList();
        List<String> opportunities = movers.stream()
            .filter(m -> m.basketChangePct() > 0)
            .sorted(Comparator.comparingDouble(ProductMover::basketChangePct).reversed())
            .limit(TOP_MOVERS_LIMIT)
            .map(MeetingBriefService::describeMover)
            .toList();

        String limitations = "This prototype does not yet track trade activations or what was said in the last review - "
            + "those need data this deployment does not have yet. Every number above is computed directly from basket, "
            + "investigation, and field-check records for this retailer only.";

        return new MeetingBriefResponse(
            template, periodDays, networkSummary, issues, fieldExecution, completedActions,
            opportunities, risks, limitations
        );
    }

    private static String describeMover(ProductMover mover) {
        return String.format(Locale.ROOT, "%s: %+.0f%% (%d baskets vs. %d before)",
            mover.productName(), mover.basketChangePct(), mover.recentBaskets(), mover.priorBaskets());
    }
}
