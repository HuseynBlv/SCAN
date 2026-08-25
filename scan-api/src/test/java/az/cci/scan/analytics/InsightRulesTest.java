package az.cci.scan.analytics;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static az.cci.scan.analytics.AnalyticsDtos.CompanionMetric;
import static az.cci.scan.analytics.AnalyticsDtos.OverviewResponse;
import static az.cci.scan.analytics.AnalyticsDtos.SegmentMetric;
import static org.assertj.core.api.Assertions.assertThat;

class InsightRulesTest {

    private final InsightRules rules = new InsightRules();

    @Test
    void refusesCommercialRecommendationForTinySamples() {
        OverviewResponse metrics = response(
            3,
            List.of(new CompanionMetric("Chips", 3, new BigDecimal("100.0"))),
            new BigDecimal("100.0")
        );

        var insights = rules.generate(metrics);

        assertThat(insights).singleElement().satisfies(insight -> {
            assertThat(insight.interpretation()).contains("too small");
            assertThat(insight.recommendedAction()).contains("Import at least five");
        });
    }

    @Test
    void flagsMappingCoverageWithoutInventingProductRelationships() {
        OverviewResponse metrics = response(10, List.of(), new BigDecimal("62.5"));

        var insights = rules.generate(metrics);

        assertThat(insights).anySatisfy(insight -> {
            assertThat(insight.fact()).contains("62.5%");
            assertThat(insight.interpretation()).contains("understate CCI penetration");
        });
    }

    private OverviewResponse response(
        long baskets,
        List<CompanionMetric> companions,
        BigDecimal mappingCoverage
    ) {
        return new OverviewResponse(
            Instant.parse("2026-08-25T00:00:00Z"),
            "TEST",
            "Test Retailer",
            baskets,
            baskets,
            new BigDecimal("100.0"),
            new BigDecimal("2.00"),
            "AZN",
            mappingCoverage,
            companions,
            List.of(),
            List.of(),
            List.of(new SegmentMetric("EVENING", baskets, new BigDecimal("100.0"))),
            List.of(),
            List.of(),
            List.of()
        );
    }
}
