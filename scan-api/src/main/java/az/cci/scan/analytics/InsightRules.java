package az.cci.scan.analytics;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import static az.cci.scan.analytics.AnalyticsDtos.Insight;
import static az.cci.scan.analytics.AnalyticsDtos.OverviewResponse;

@Component
public class InsightRules {

    public List<Insight> generate(OverviewResponse metrics) {
        List<Insight> insights = new ArrayList<>();

        if (metrics.totalBaskets() < 5) {
            insights.add(new Insight(
                "SCAN currently has " + metrics.totalBaskets() + " validated basket(s) for this retailer.",
                "The sample is too small for a reliable commercial recommendation.",
                "Import at least five complete baskets, then review mapping coverage before acting."
            ));
            return insights;
        }

        if (!metrics.topCompanionProducts().isEmpty() && metrics.cciBaskets() > 0) {
            var companion = metrics.topCompanionProducts().getFirst();
            insights.add(new Insight(
                companion.name() + " appears in " + companion.attachmentRatePercentage()
                    + "% of mapped CCI baskets.",
                companion.attachmentRatePercentage().compareTo(new BigDecimal("20")) >= 0
                    ? "This is the strongest observed mapped companion relationship."
                    : "The relationship is currently present but weak.",
                companion.attachmentRatePercentage().compareTo(new BigDecimal("20")) >= 0
                    ? "Consider a controlled CCI + " + companion.name() + " placement or bundle test."
                    : "Collect more baskets before changing promotion or placement."
            ));
        }

        metrics.dayparts().stream()
            .max(Comparator.comparing(AnalyticsDtos.SegmentMetric::basketCount))
            .filter(daypart -> daypart.sharePercentage().compareTo(new BigDecimal("35")) >= 0)
            .ifPresent(daypart -> insights.add(new Insight(
                daypart.sharePercentage() + "% of validated baskets occur in the "
                    + daypart.segment().toLowerCase() + " daypart.",
                "Basket activity is concentrated enough to justify time-specific execution.",
                "Prioritize availability and any pilot activation during this daypart."
            )));

        if (metrics.mappedLinePercentage().compareTo(new BigDecimal("90")) < 0) {
            insights.add(new Insight(
                metrics.mappedLinePercentage() + "% of transaction lines are mapped to canonical products.",
                "Unmapped products can understate CCI penetration and companion relationships.",
                "Resolve high-volume unmapped products before using these metrics for a commercial decision."
            ));
        }

        return insights.stream().limit(3).toList();
    }
}
