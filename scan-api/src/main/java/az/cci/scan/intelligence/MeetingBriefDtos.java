package az.cci.scan.intelligence;

import java.util.List;

/**
 * A structured meeting-prep summary, built entirely from real records: open investigations,
 * field-task results, closed investigations, and real product movers. There is no
 * "activations" or "actions from the last review" section yet - those need the Phase 2/3 data
 * this codebase does not have (activations, stored meeting briefs), so this prototype says so in
 * {@code limitations} rather than inventing content to fill the section.
 */
final class MeetingBriefDtos {

    private MeetingBriefDtos() {
    }

    record MeetingBriefResponse(
        String template,
        int periodDays,
        String networkSummary,
        List<String> issuesRequiringDecision,
        List<String> fieldExecution,
        List<String> completedActions,
        List<String> topOpportunities,
        List<String> risks,
        String limitations
    ) {
    }
}
