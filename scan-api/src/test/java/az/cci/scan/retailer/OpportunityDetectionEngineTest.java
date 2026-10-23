package az.cci.scan.retailer;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class OpportunityDetectionEngineTest {
    private final OpportunityDetectionEngine engine = new OpportunityDetectionEngine();
    private final ZoneId zone = ZoneId.of("Asia/Baku");

    @Test
    void reconstructsBasketsAndCalculatesSupportConfidenceAndLift() {
        List<OpportunityDetectionEngine.Line> lines = new ArrayList<>();
        Instant start = Instant.parse("2026-09-01T08:00:00Z");
        for (int i = 0; i < 100; i++) {
            add(lines, i, start, "Base " + i, "Grocery", true);
            if (i < 40) add(lines, i, start, "Cola", "Beverages", true);
            if (i < 20 || (i >= 40 && i < 50)) add(lines, i, start, "Chips", "Snacks", true);
        }

        var opportunity = engine.detect(lines, zone, Instant.parse("2026-10-01T00:00:00Z")).stream()
            .filter(item -> item.type() == RetailerOpportunityDtos.OpportunityType.CROSS_SELL)
            .filter(item -> item.subjects().containsAll(List.of("Cola", "Chips")))
            .findFirst().orElseThrow();

        assertThat(opportunity.metrics().get("jointBaskets")).isEqualByComparingTo("20");
        assertThat(opportunity.metrics().get("supportPercentage")).isEqualByComparingTo("20.0");
        // Products are canonicalized alphabetically, so this is confidence(Chips -> Cola).
        assertThat(opportunity.metrics().get("confidencePercentage")).isEqualByComparingTo("66.7");
        assertThat(opportunity.metrics().get("lift")).isEqualByComparingTo("1.67");
        assertThat(opportunity.evidence().receiptCount()).isEqualTo(100);
    }

    @Test
    void duplicateLinesWithinAReceiptDoNotInflatePairCounts() {
        List<OpportunityDetectionEngine.Line> lines = supportedPairData();
        for (int i = 0; i < 10; i++) add(lines, i, Instant.parse("2026-09-01T08:00:00Z"), "Cola", "Beverages", true);

        var opportunity = pair(engine.detect(lines, zone, Instant.parse("2026-10-01T00:00:00Z")));

        assertThat(opportunity.metrics().get("productABaskets")).isEqualByComparingTo("30");
        assertThat(opportunity.metrics().get("jointBaskets")).isEqualByComparingTo("20");
    }

    @Test
    void rejectsSmallSamplesAndRareCoincidences() {
        List<OpportunityDetectionEngine.Line> small = new ArrayList<>();
        Instant start = Instant.parse("2026-09-01T08:00:00Z");
        for (int i = 0; i < 29; i++) add(small, i, start, i < 2 ? "Cola" : "Bread", i < 2 ? "Beverages" : "Bakery", true);
        assertThat(engine.detect(small, zone, Instant.now())).isEmpty();

        List<OpportunityDetectionEngine.Line> rare = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            add(rare, i, start, "Base " + i, "Grocery", true);
            if (i < 4) { add(rare, i, start, "Cola", "Beverages", true); add(rare, i, start, "Chips", "Snacks", true); }
        }
        assertThat(engine.detect(rare, zone, Instant.now())).noneMatch(item -> item.type() == RetailerOpportunityDtos.OpportunityType.CROSS_SELL);
    }

    @Test
    void stableIdentitySurvivesRepeatedAnalysisAndInputOrdering() {
        List<OpportunityDetectionEngine.Line> lines = supportedPairData();
        List<String> first = engine.detect(lines, zone, Instant.parse("2026-10-01T00:00:00Z")).stream().map(RetailerOpportunityDtos.Opportunity::id).toList();
        List<OpportunityDetectionEngine.Line> reversed = new ArrayList<>(lines);
        java.util.Collections.reverse(reversed);
        List<String> second = engine.detect(reversed, zone, Instant.parse("2026-10-01T00:00:00Z")).stream().map(RetailerOpportunityDtos.Opportunity::id).toList();
        assertThat(second).containsExactlyElementsOf(first);
    }

    @Test
    void categoryRecommendationsRequireAdequateProductMapping() {
        List<OpportunityDetectionEngine.Line> lines = new ArrayList<>();
        Instant start = Instant.parse("2026-09-01T08:00:00Z");
        for (int i = 0; i < 100; i++) {
            add(lines, i, start, "Sandwich", "Sandwiches", i < 80);
            if (i < 5) add(lines, i, start, "Cola", "Beverages", true);
        }
        assertThat(engine.detect(lines, zone, Instant.now()))
            .noneMatch(item -> item.type() == RetailerOpportunityDtos.OpportunityType.BEVERAGE_ATTACHMENT);
    }

    @Test
    void detectsRateChangeAcrossEquivalentPeriodsInsteadOfComparingRawTotals() {
        List<OpportunityDetectionEngine.Line> lines = new ArrayList<>();
        Instant start = Instant.parse("2026-08-01T08:00:00Z");
        for (int i = 0; i < 80; i++) {
            add(lines, i, start.plusSeconds(i * 43_200L), "Basket item " + i, "Grocery", true);
            if ((i >= 24 && i < 52 && i < 30) || (i >= 52 && i < 76)) {
                add(lines, i, start.plusSeconds(i * 43_200L), "Growing product", "Grocery", true);
            }
        }
        assertThat(engine.detect(lines, zone, Instant.now())).anyMatch(item ->
            item.type() == RetailerOpportunityDtos.OpportunityType.PRODUCT_TREND
                && item.subjects().contains("Growing product")
                && item.metrics().get("relativeChangePercentage").signum() > 0);
    }

    private List<OpportunityDetectionEngine.Line> supportedPairData() {
        List<OpportunityDetectionEngine.Line> lines = new ArrayList<>();
        Instant start = Instant.parse("2026-09-01T08:00:00Z");
        for (int i = 0; i < 100; i++) {
            add(lines, i, start, "Base " + i, "Grocery", true);
            if (i < 40) add(lines, i, start, "Cola", "Beverages", true);
            if (i < 20 || (i >= 40 && i < 50)) add(lines, i, start, "Chips", "Snacks", true);
        }
        return lines;
    }

    private static RetailerOpportunityDtos.Opportunity pair(List<RetailerOpportunityDtos.Opportunity> opportunities) {
        return opportunities.stream().filter(item -> item.type() == RetailerOpportunityDtos.OpportunityType.CROSS_SELL)
            .filter(item -> item.subjects().containsAll(List.of("Cola", "Chips"))).findFirst().orElseThrow();
    }

    private static void add(List<OpportunityDetectionEngine.Line> lines, int receipt, Instant timestamp, String product, String category, boolean mapped) {
        lines.add(new OpportunityDetectionEngine.Line("r-" + receipt, "STORE-1", timestamp, product, category, mapped));
    }
}
