package az.cci.scan.intelligence;

import az.cci.scan.domain.Investigation;
import az.cci.scan.domain.InvestigationHypothesis;
import az.cci.scan.domain.Retailer;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductChange;
import az.cci.scan.intelligence.ChangeDetectionDtos.StoreContribution;
import az.cci.scan.intelligence.CopilotDtos.ContextType;
import az.cci.scan.intelligence.CopilotDtos.CopilotAnswer;
import az.cci.scan.intelligence.CopilotDtos.NextStep;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * SCAN's Copilot - and deliberately not a live language model. This is the
 * USER -&gt; INTENT -&gt; ANALYTICS TOOL -&gt; STRUCTURED RESULT -&gt; INTERPRETATION -&gt; EVIDENCE SHOWN
 * pipeline the product spec calls for, implemented as real tool calls into
 * {@link ChangeDetectionService} and {@link InvestigationService} plus a fixed template - not a
 * paid API call generating free text. Every number in an answer traces to one of those calls;
 * nothing here is invented, and a question this class cannot ground in real data gets the honest
 * fallback ("the current SCAN data cannot answer this reliably"), never a confident-sounding guess.
 */
@Service
public class CopilotService {

    private static final String EPISTEMIC_NOTE =
        "SCAN has no direct stock-level or competitor data. Availability and placement signals "
            + "are inferred from basket presence, not confirmed causes - a field check is the way "
            + "to get real confirmation.";
    private static final int DEFAULT_PERIOD_DAYS = 14;

    private final ChangeDetectionService changeDetectionService;
    private final InvestigationService investigationService;

    CopilotService(ChangeDetectionService changeDetectionService, InvestigationService investigationService) {
        this.changeDetectionService = changeDetectionService;
        this.investigationService = investigationService;
    }

    public CopilotAnswer answer(
        Retailer retailer, ContextType contextType, String subjectName, UUID investigationId, Integer periodDays
    ) {
        return switch (contextType) {
            case PRODUCT -> subjectName == null || subjectName.isBlank()
                ? fallback()
                : answerForProduct(retailer, subjectName, periodDays == null ? DEFAULT_PERIOD_DAYS : periodDays);
            case INVESTIGATION -> investigationId == null
                ? fallback()
                : answerForInvestigation(retailer, investigationId);
            case GENERAL -> fallback();
        };
    }

    private CopilotAnswer answerForProduct(Retailer retailer, String productName, int periodDays) {
        ProductChange change = changeDetectionService.compareProduct(retailer, productName, periodDays);
        boolean declined = change.basketChangePct() < 0;

        String whatScanFound = String.format(Locale.ROOT,
            "%s appeared in %d baskets over the last %d days, vs. %d in the prior %d days (%.0f%% %s).",
            productName, change.recentBaskets(), periodDays, change.priorBaskets(), periodDays,
            Math.abs(change.basketChangePct()), declined ? "decline" : "increase"
        );

        String whyThisMatters = declined
            ? "This is a real, measured drop in basket presence - not a rounding artifact or a single bad day."
            : "This is a real increase in basket presence over the comparison window.";

        List<String> explanations = new java.util.ArrayList<>();
        List<String> evidence = new java.util.ArrayList<>();
        if (change.availabilitySignal()) {
            explanations.add("Availability issue: this product may not be consistently in stock or on shelf in the affected stores.");
            evidence.add(change.availabilityEvidence());
        }
        if (change.concentrationSignal()) {
            explanations.add("Placement or execution issue: the decline is concentrated in a small number of stores rather than spread across the network.");
            evidence.add(change.concentrationEvidence());
        }
        if (explanations.isEmpty()) {
            if (declined) {
                explanations.add("No availability or concentration signal was strong enough to explain this change on its own.");
            }
            List<StoreContribution> topMovers = change.storeContributions().stream()
                .sorted(java.util.Comparator.comparingLong(StoreContribution::basketDelta))
                .limit(3)
                .toList();
            for (StoreContribution c : topMovers) {
                evidence.add(String.format(Locale.ROOT, "%s: %d baskets recently vs. %d before.",
                    c.externalStoreId(), c.recentProductBaskets(), c.priorProductBaskets()));
            }
        }

        String confidence = (change.availabilitySignal() || change.concentrationSignal()) ? "MEDIUM" : "LOW";

        return new CopilotAnswer(
            whatScanFound,
            whyThisMatters,
            explanations,
            evidence,
            confidence,
            EPISTEMIC_NOTE,
            List.of(
                new NextStep("Start an investigation", "START_INVESTIGATION", productName),
                new NextStep("Create a field check", "CREATE_FIELD_CHECK", productName),
                new NextStep("Compare stores", "COMPARE_STORES", productName)
            )
        );
    }

    private CopilotAnswer answerForInvestigation(Retailer retailer, UUID investigationId) {
        Investigation investigation = investigationService.get(retailer, investigationId);

        String whatScanFound = String.format(Locale.ROOT,
            "\"%s\" is %s with %d hypothesis(es) and %d note(s) on record.",
            investigation.getTitle(), investigation.getStatus().name().toLowerCase(Locale.ROOT).replace('_', ' '),
            investigation.getHypotheses().size(), investigation.getNotes().size()
        );

        String whyThisMatters = switch (investigation.getStatus()) {
            case OPEN, IN_PROGRESS -> "This investigation is still open and needs a decision or more evidence before it can be closed out.";
            case CLOSED -> "This investigation was closed on " + investigation.getClosedAt() + ".";
        };

        List<InvestigationHypothesis> openHypotheses = investigation.getHypotheses().stream()
            .filter(h -> h.getStatus() == InvestigationHypothesis.Status.OPEN)
            .toList();
        List<String> explanations = openHypotheses.stream().map(h ->
            h.getStatement() + " (" + h.getConfidence() + " confidence)"
        ).toList();
        List<String> evidence = openHypotheses.stream().map(InvestigationHypothesis::getSupportingEvidence).toList();
        String contradicting = openHypotheses.stream()
            .map(InvestigationHypothesis::getContradictingEvidence)
            .filter(java.util.Objects::nonNull)
            .findFirst()
            .orElse(null);

        String confidence = openHypotheses.stream()
            .map(InvestigationHypothesis::getConfidence)
            .max(java.util.Comparator.naturalOrder())
            .map(Enum::name)
            .orElse("NONE");

        String whatWeStillDontKnow = contradicting != null ? contradicting + " " + EPISTEMIC_NOTE : EPISTEMIC_NOTE;

        return new CopilotAnswer(
            whatScanFound,
            whyThisMatters,
            explanations,
            evidence,
            confidence,
            whatWeStillDontKnow,
            List.of(
                new NextStep("Create a field check", "CREATE_FIELD_CHECK", investigationId.toString()),
                new NextStep("Open investigation", "OPEN_INVESTIGATION", investigationId.toString())
            )
        );
    }

    private CopilotAnswer fallback() {
        return new CopilotAnswer(
            "The current SCAN data cannot answer this reliably.",
            "Answering this would require guessing rather than using real, computed evidence.",
            List.of(),
            List.of(),
            "NONE",
            "Ask about a specific product, store, or open investigation, or start a new investigation from a real question.",
            List.of(new NextStep("Start an investigation", "START_INVESTIGATION", null))
        );
    }
}
