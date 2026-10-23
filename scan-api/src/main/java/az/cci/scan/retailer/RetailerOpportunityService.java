package az.cci.scan.retailer;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.ImportJobRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static az.cci.scan.retailer.RetailerOpportunityDtos.Evidence;
import static az.cci.scan.retailer.RetailerOpportunityDtos.Opportunity;
import static az.cci.scan.retailer.RetailerOpportunityDtos.OpportunityType;
import static az.cci.scan.retailer.RetailerOpportunityDtos.Priority;
import static az.cci.scan.retailer.RetailerOpportunityDtos.RecommendedAction;
import static az.cci.scan.retailer.RetailerOpportunityDtos.Response;
import static az.cci.scan.retailer.RetailerOpportunityDtos.Status;
import static az.cci.scan.retailer.RetailerOpportunityDtos.Summary;
import static az.cci.scan.retailer.RetailerOpportunityDtos.Trial;

@Service
public class RetailerOpportunityService {
    private final RetailerOpportunityQueryRepository query;
    private final ImportJobRepository imports;
    private final OpportunityDetectionEngine engine = new OpportunityDetectionEngine();

    RetailerOpportunityService(RetailerOpportunityQueryRepository query, ImportJobRepository imports) {
        this.query = query;
        this.imports = imports;
    }

    public Response opportunities(Retailer retailer) {
        ZoneId zone = ZoneId.of(retailer.getZoneId());
        List<OpportunityDetectionEngine.Line> lines = query.lines(retailer.getId());
        ImportJob latest = imports.findFirstByRetailerAndStatusOrderByCreatedAtDesc(retailer, ImportJob.Status.COMPLETED).orElse(null);
        Instant importAt = latest == null ? null : latest.getCompletedAt();
        Instant analyzedAt = importAt == null ? Instant.now() : importAt;
        List<Opportunity> detected = new ArrayList<>(engine.detect(lines, zone, analyzedAt));
        Map<String, RetailerOpportunityQueryRepository.TrialRow> trials = new HashMap<>();
        query.trials(retailer.getId()).forEach(row -> trials.put(row.opportunityKey(), row));

        List<Opportunity> merged = detected.stream().map(opportunity -> attachTrial(opportunity, trials.remove(opportunity.id()), lines, zone)).collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        trials.values().stream().filter(row -> status(row, zone) != Status.COMPLETED)
            .map(row -> restored(row, lines, zone, analyzedAt)).forEach(merged::add);
        merged.sort(java.util.Comparator.comparing((Opportunity o) -> o.status() == Status.ACTIVE ? 0 : o.status() == Status.DETECTED ? 1 : 2)
            .thenComparing(o -> o.priority().ordinal()).thenComparing(Opportunity::title));

        long receipts = lines.stream().map(OpportunityDetectionEngine.Line::receiptId).distinct().count();
        long mapped = lines.stream().filter(OpportunityDetectionEngine.Line::mapped).count();
        BigDecimal coverage = pct(mapped, lines.size());
        List<RetailerOpportunityQueryRepository.TrialRow> allTrials = query.trials(retailer.getId());
        int active = (int) allTrials.stream().filter(t -> status(t, zone) == Status.ACTIVE).count();
        int completed = (int) allTrials.stream().filter(t -> status(t, zone) == Status.COMPLETED).count();
        String coverageStatus = receipts < OpportunityDetectionEngine.MIN_BASKETS ? "INSUFFICIENT_DATA"
            : coverage.compareTo(OpportunityDetectionEngine.MIN_MAPPING_COVERAGE) < 0 ? "LIMITED_MAPPING" : "READY";
        String dataset = retailer.getCode().equalsIgnoreCase("KAGGLE") || retailer.getCode().equalsIgnoreCase("DEMO") ? "DEMONSTRATION" : "OPERATIONAL";
        Summary summary = new Summary(analyzedAt, importAt, dataset, coverageStatus, receipts, coverage,
            (int) merged.stream().filter(o -> o.status() == Status.DETECTED).count(), active, completed);
        return new Response(summary, List.copyOf(merged));
    }

    @Transactional
    public Opportunity startTrial(Retailer retailer, String opportunityId, LocalDate start, Integer requestedDuration, String createdBy) {
        if (start.isBefore(LocalDate.now(ZoneId.of(retailer.getZoneId())))) {
            throw new IllegalArgumentException("Trial start date cannot be in the past.");
        }
        Opportunity opportunity = opportunities(retailer).opportunities().stream().filter(o -> o.id().equals(opportunityId)).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("This opportunity is no longer available. Refresh the analysis."));
        if (opportunity.trial() != null) throw new IllegalArgumentException("A trial already exists for this opportunity.");
        int duration = requestedDuration == null ? opportunity.recommendedAction().durationDays() : requestedDuration;
        LocalDate end = start.plusDays(duration - 1L);
        LocalDate baselineEnd = start.minusDays(1);
        LocalDate baselineStart = baselineEnd.minusDays(duration - 1L);
        RetailerOpportunityQueryRepository.TrialRow row;
        try {
            row = query.insertTrial(retailer.getId(), opportunity, start, end, baselineStart, baselineEnd, createdBy);
        } catch (DataIntegrityViolationException duplicateTrial) {
            throw new IllegalArgumentException("A trial already exists for this opportunity.", duplicateTrial);
        }
        return attachTrial(opportunity, row, query.lines(retailer.getId()), ZoneId.of(retailer.getZoneId()));
    }

    private Opportunity attachTrial(Opportunity o, RetailerOpportunityQueryRepository.TrialRow row, List<OpportunityDetectionEngine.Line> lines, ZoneId zone) {
        if (row == null) return o;
        Trial trial = trial(row, lines, zone);
        Status status = status(row, zone);
        return new Opportunity(o.id(), o.storeId(), o.type(), o.title(), o.description(), o.subjects(), o.priority(), status,
            o.metrics(), o.primaryMetricLabel(), o.primaryMetricValue(), o.evidence(), o.recommendedAction(), trial, o.detectedAt(), row.createdAt());
    }

    private Opportunity restored(RetailerOpportunityQueryRepository.TrialRow row, List<OpportunityDetectionEngine.Line> lines, ZoneId zone, Instant analyzedAt) {
        OpportunityType type = OpportunityType.valueOf(row.opportunityType());
        List<String> subjects = row.productB() == null ? List.of(row.productA()) : List.of(row.productA(), row.productB());
        Evidence evidence = new Evidence(row.baselineDenominator(), row.baselineNumerator(), row.baselineStart(), row.baselineEnd(),
            pct(lines.stream().filter(OpportunityDetectionEngine.Line::mapped).count(), lines.size()),
            "This saved trial remains visible even though the latest data no longer clears the detection threshold.",
            "SCAN preserves active trials so their measurement window is not interrupted by a ranking change.",
            "The original opportunity snapshot is retained; current detection rank may differ.");
        RecommendedAction action = new RecommendedAction(row.actionTitle(), "Continue the saved trial through its measurement window.",
            (int) (row.endDate().toEpochDay() - row.startDate().toEpochDay() + 1));
        Trial trial = trial(row, lines, zone);
        return new Opportunity(row.opportunityKey(), row.storeId(), type, row.title(), "Saved placement or attachment trial.", subjects,
            Priority.MEDIUM, status(row, zone), Map.of("baselineValue", row.baselineValue()), "Baseline", row.baselineValue() + "%",
            evidence, action, trial, row.createdAt(), analyzedAt);
    }

    private Trial trial(RetailerOpportunityQueryRepository.TrialRow row, List<OpportunityDetectionEngine.Line> lines, ZoneId zone) {
        LocalDate today = LocalDate.now(zone);
        LocalDate through = today.isBefore(row.endDate()) ? today : row.endDate();
        Measurement measurement = through.isBefore(row.startDate()) ? null : measure(row, lines, zone, row.startDate(), through);
        String note = measurement == null ? "Measurement starts on the selected date. The baseline is preserved for comparison."
            : "Observed during-trial change is not causal proof; seasonality, availability, and other store changes may contribute.";
        return new Trial(row.id(), status(row, zone).name(), row.startDate(), row.endDate(), row.baselineStart(), row.baselineEnd(),
            row.baselineMetric(), row.baselineValue(), measurement == null ? null : measurement.value(),
            measurement == null ? null : measurement.numerator(), measurement == null ? null : measurement.denominator(), note);
    }

    private Measurement measure(RetailerOpportunityQueryRepository.TrialRow row, List<OpportunityDetectionEngine.Line> lines, ZoneId zone, LocalDate from, LocalDate to) {
        Map<String, List<OpportunityDetectionEngine.Line>> baskets = lines.stream()
            .filter(line -> line.storeId().equals(row.storeId()))
            .filter(line -> { LocalDate date = line.timestamp().atZone(zone).toLocalDate(); return !date.isBefore(from) && !date.isAfter(to); })
            .collect(java.util.stream.Collectors.groupingBy(OpportunityDetectionEngine.Line::receiptId));
        List<List<OpportunityDetectionEngine.Line>> eligible = baskets.values().stream().filter(basket -> switch (row.baselineMetric()) {
            case "BEVERAGE_ATTACHMENT" -> containsSubject(basket, row.productA());
            case "PEAK_WINDOW_SHARE" -> hasBeverageAndSnack(basket);
            default -> true;
        }).toList();
        long denominator = eligible.size();
        long numerator = eligible.stream().filter(basket -> switch (row.baselineMetric()) {
            case "BEVERAGE_ATTACHMENT" -> basket.stream().anyMatch(line -> isBeverage(line.category()));
            case "PEAK_WINDOW_SHARE" -> daypart(basket.getFirst().timestamp().atZone(zone).getHour()).equals(peakDaypart(row.title()));
            default -> containsSubject(basket, row.productA())
                && (row.productB() == null || containsSubject(basket, row.productB()));
        }).count();
        return new Measurement(pct(numerator, denominator), numerator, denominator);
    }

    private static boolean containsSubject(List<OpportunityDetectionEngine.Line> basket, String subject) {
        return basket.stream().anyMatch(line -> line.product().equals(subject) || line.category().equals(subject));
    }

    private static boolean hasBeverageAndSnack(List<OpportunityDetectionEngine.Line> basket) {
        return basket.stream().anyMatch(line -> isBeverage(line.category()))
            && basket.stream().anyMatch(line -> isSnack(line.category()));
    }

    private static String peakDaypart(String title) {
        int separator = title.indexOf(' ');
        return (separator < 0 ? title : title.substring(0, separator)).toUpperCase(java.util.Locale.ROOT);
    }

    private static String daypart(int hour) {
        if (hour < 6) return "NIGHT";
        if (hour < 11) return "MORNING";
        if (hour < 15) return "MIDDAY";
        if (hour < 18) return "AFTERNOON";
        if (hour < 22) return "EVENING";
        return "NIGHT";
    }

    private Status status(RetailerOpportunityQueryRepository.TrialRow row, ZoneId zone) {
        LocalDate today = LocalDate.now(zone);
        if (today.isAfter(row.endDate())) return Status.COMPLETED;
        return Status.ACTIVE;
    }

    private static boolean isBeverage(String category) { String c = category.toLowerCase(java.util.Locale.ROOT); return c.contains("beverage") || c.contains("drink") || c.contains("water") || c.contains("juice") || c.contains("tea") || c.contains("soda"); }
    private static boolean isSnack(String category) { String c = category.toLowerCase(java.util.Locale.ROOT); return c.contains("snack") || c.contains("chip") || c.contains("confection") || c.contains("biscuit"); }
    private static BigDecimal pct(long numerator, long denominator) { return denominator == 0 ? BigDecimal.ZERO.setScale(1) : BigDecimal.valueOf(numerator * 100d / denominator).setScale(1, RoundingMode.HALF_UP); }
    private record Measurement(BigDecimal value, long numerator, long denominator) {}
}
