package az.cci.scan.intelligence;

import az.cci.scan.domain.Investigation;
import az.cci.scan.domain.InvestigationHypothesis;
import az.cci.scan.domain.InvestigationNote;
import az.cci.scan.domain.Retailer;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductChange;
import az.cci.scan.repository.InvestigationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Opens and maintains investigations - SCAN's persistent record of a business question, the
 * evidence for it, and what was eventually decided. Product investigations seed themselves with
 * real hypotheses from {@link ChangeDetectionService}; nothing here invents a cause. There is
 * deliberately no "competitive substitution" hypothesis anywhere in this class - SCAN has no
 * competitor-product data source, so a hypothesis claiming one would not trace to real evidence.
 */
@Service
public class InvestigationService {

    private final InvestigationRepository investigationRepository;
    private final ChangeDetectionService changeDetectionService;

    InvestigationService(InvestigationRepository investigationRepository, ChangeDetectionService changeDetectionService) {
        this.investigationRepository = investigationRepository;
        this.changeDetectionService = changeDetectionService;
    }

    /**
     * Opens an investigation into a CCI product, seeded from a real recent-vs-prior comparison.
     * Hypotheses are only added when the underlying signal actually fired - a flat or improving
     * product gets a note explaining that, not a fabricated concern.
     */
    @Transactional
    public Investigation openForProduct(Retailer retailer, String productName, int periodDays, String createdBy) {
        ProductChange change = changeDetectionService.compareProduct(retailer, productName, periodDays);
        boolean declined = change.basketChangePct() < 0;

        String title = declined
            ? "%s is down %.0f%% vs. the prior %d days".formatted(productName, Math.abs(change.basketChangePct()), periodDays)
            : "%s changed %.0f%% vs. the prior %d days".formatted(productName, change.basketChangePct(), periodDays);
        String question = "What changed for %s over the last %d days?".formatted(productName, periodDays);

        Investigation investigation = new Investigation(
            retailer, title, question, Investigation.SubjectType.PRODUCT, productName,
            periodDays, "Commercial Team", createdBy
        );

        int sortOrder = 0;
        if (change.availabilitySignal()) {
            investigation.addHypothesis(new InvestigationHypothesis(
                investigation,
                "Availability issue: this product may not be consistently in stock or on shelf in the affected stores.",
                change.availabilityEvidence(),
                "SCAN has no direct stock-level feed - this is inferred from basket presence dropping to near zero, not a confirmed stockout.",
                InvestigationHypothesis.Confidence.MEDIUM,
                sortOrder++
            ));
        }
        if (change.concentrationSignal()) {
            investigation.addHypothesis(new InvestigationHypothesis(
                investigation,
                "Placement or execution issue: the decline is concentrated in a small number of stores rather than spread across the network.",
                change.concentrationEvidence(),
                null,
                InvestigationHypothesis.Confidence.MEDIUM,
                sortOrder++
            ));
        }
        if (sortOrder == 0 && declined) {
            investigation.addHypothesis(new InvestigationHypothesis(
                investigation,
                "No availability or concentration signal was strong enough to explain this change on its own.",
                "Checked per-store basket presence for this product in both windows: no store dropped to near-zero, and the decline is not concentrated in a few stores.",
                null,
                InvestigationHypothesis.Confidence.LOW,
                sortOrder++
            ));
        }

        investigation.addNote(new InvestigationNote(investigation, "SCAN", summarize(change), true));

        return investigationRepository.save(investigation);
    }

    /** A manually started investigation - a real question with no auto-generated hypothesis yet. */
    @Transactional
    public Investigation openGeneral(Retailer retailer, String title, String question, String createdBy) {
        Investigation investigation = new Investigation(
            retailer, title, question, Investigation.SubjectType.GENERAL, null, 14, "Commercial Team", createdBy
        );
        return investigationRepository.save(investigation);
    }

    public Investigation get(Retailer retailer, UUID investigationId) {
        return investigationRepository.findByIdAndRetailer(investigationId, retailer)
            .orElseThrow(() -> new IllegalArgumentException("Unknown investigation: " + investigationId));
    }

    public List<Investigation> list(Retailer retailer, boolean openOnly) {
        return openOnly
            ? investigationRepository.findAllByRetailerAndStatusNotOrderByCreatedAtDesc(retailer, Investigation.Status.CLOSED)
            : investigationRepository.findAllByRetailerOrderByCreatedAtDesc(retailer);
    }

    @Transactional
    public Investigation addNote(Retailer retailer, UUID investigationId, String author, String body) {
        Investigation investigation = get(retailer, investigationId);
        investigation.addNote(new InvestigationNote(investigation, author, body, false));
        investigation.markInProgress();
        return investigation;
    }

    @Transactional
    public Investigation addHypothesis(
        Retailer retailer, UUID investigationId, String statement, String supportingEvidence,
        String contradictingEvidence, InvestigationHypothesis.Confidence confidence
    ) {
        Investigation investigation = get(retailer, investigationId);
        int sortOrder = investigation.getHypotheses().size();
        investigation.addHypothesis(new InvestigationHypothesis(
            investigation, statement, supportingEvidence, contradictingEvidence, confidence, sortOrder
        ));
        return investigation;
    }

    @Transactional
    public Investigation setHypothesisStatus(
        Retailer retailer, UUID investigationId, UUID hypothesisId, InvestigationHypothesis.Status status
    ) {
        Investigation investigation = get(retailer, investigationId);
        InvestigationHypothesis hypothesis = investigation.getHypotheses().stream()
            .filter(h -> h.getId().equals(hypothesisId))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Unknown hypothesis: " + hypothesisId));
        switch (status) {
            case CONFIRMED -> hypothesis.markConfirmed();
            case REJECTED -> hypothesis.markRejected();
            case OPEN -> throw new IllegalArgumentException("Cannot reset a hypothesis back to OPEN");
        }
        return investigation;
    }

    @Transactional
    public Investigation close(Retailer retailer, UUID investigationId) {
        Investigation investigation = get(retailer, investigationId);
        investigation.close();
        return investigation;
    }

    @Transactional
    public Investigation reopen(Retailer retailer, UUID investigationId) {
        Investigation investigation = get(retailer, investigationId);
        investigation.reopen();
        return investigation;
    }

    private static String summarize(ProductChange change) {
        String direction = change.basketChangePct() < 0 ? "fewer" : "more";
        return String.format(Locale.ROOT,
            "In the last window, %s appeared in %d baskets vs. %d in the prior window of equal length "
                + "(%.0f%% %s baskets). Revenue moved from %s to %s over the same comparison.",
            change.productName(), change.recentBaskets(), change.priorBaskets(),
            Math.abs(change.basketChangePct()), direction,
            change.priorRevenue(), change.recentRevenue()
        );
    }
}
