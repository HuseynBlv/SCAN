package az.cci.scan.intelligence;

import jakarta.validation.constraints.NotBlank;

import java.util.List;
import java.util.UUID;

/**
 * The structured shape every Copilot answer takes - deliberately not a single prose blob. Each
 * field maps to one section of the format the product spec requires: what SCAN found, why it
 * matters, a possible (never asserted) explanation, the evidence behind it, how confident that
 * evidence is, what SCAN explicitly cannot determine, and what to do next. A field is empty
 * rather than filled with a guess when the underlying data does not support it.
 *
 * <p>Public (not just the controller's response body) so the network package's Copilot endpoint
 * can build the exact same answer shape for a network-wide product question, via
 * {@link CopilotService#buildProductAnswer}, instead of inventing a parallel one.
 */
public final class CopilotDtos {

    private CopilotDtos() {
    }

    public enum ContextType {
        PRODUCT,
        INVESTIGATION,
        GENERAL
    }

    public record AskRequest(
        @NotBlank String contextType,
        String subjectName,
        UUID investigationId,
        Integer periodDays,
        @NotBlank String question
    ) {
    }

    public record NextStep(String label, String actionType, String targetId) {
    }

    public record CopilotAnswer(
        String whatScanFound,
        String whyThisMatters,
        List<String> possibleExplanations,
        List<String> evidence,
        String confidence,
        String whatWeStillDontKnow,
        List<NextStep> nextSteps,
        List<String> priorCases
    ) {
    }
}
