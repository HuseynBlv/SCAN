package az.cci.scan.retailer;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class RetailerOpportunityQueryRepository {
    private static final String LINES = """
        select cast(r.id as varchar) receipt_id, s.external_store_id, r.transaction_timestamp,
               coalesce(cp.normalized_name, rp.original_product_name) product_name,
               coalesce(nullif(trim(cp.category), ''), nullif(trim(rp.original_category), ''), 'Unmapped') category,
               case when cp.id is null then false else true end mapped
        from receipt r
        join store s on s.id = r.store_id
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id = ?
        order by r.transaction_timestamp, r.id, tl.source_row_number
        """;

    private final JdbcTemplate jdbc;

    RetailerOpportunityQueryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<OpportunityDetectionEngine.Line> lines(UUID retailerId) {
        return jdbc.query(LINES, (rs, row) -> new OpportunityDetectionEngine.Line(
            rs.getString("receipt_id"), rs.getString("external_store_id"),
            rs.getTimestamp("transaction_timestamp").toInstant(), rs.getString("product_name"),
            rs.getString("category"), rs.getBoolean("mapped")
        ), retailerId);
    }

    List<TrialRow> trials(UUID retailerId) {
        return jdbc.query("""
            select * from retailer_opportunity_trial where retailer_id = ? order by start_date desc, created_at desc
            """, (rs, row) -> trial(rs), retailerId);
    }

    Optional<TrialRow> trial(UUID retailerId, String opportunityKey) {
        return jdbc.query("""
            select * from retailer_opportunity_trial where retailer_id = ? and opportunity_key = ?
            """, (rs, row) -> trial(rs), retailerId, opportunityKey).stream().findFirst();
    }

    TrialRow insertTrial(
        UUID retailerId, RetailerOpportunityDtos.Opportunity opportunity, LocalDate start, LocalDate end,
        LocalDate baselineStart, LocalDate baselineEnd, String createdBy
    ) {
        UUID id = UUID.randomUUID();
        String a = opportunity.subjects().isEmpty() ? null : opportunity.subjects().get(0);
        String b = opportunity.subjects().size() < 2 ? null : opportunity.subjects().get(1);
        BigDecimal baseline = baselineMetric(opportunity);
        long numerator = baselineNumerator(opportunity);
        long denominator = baselineDenominator(opportunity);
        jdbc.update("""
            insert into retailer_opportunity_trial (
                id, retailer_id, opportunity_key, opportunity_type, title, store_id, product_a, product_b,
                action_title, start_date, end_date, baseline_start, baseline_end, baseline_metric,
                baseline_value, baseline_numerator, baseline_denominator, created_by, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, id, retailerId, opportunity.id(), opportunity.type().name(), opportunity.title(), opportunity.storeId(),
            a, b, opportunity.recommendedAction().title(), Date.valueOf(start), Date.valueOf(end),
            Date.valueOf(baselineStart), Date.valueOf(baselineEnd), metricName(opportunity), baseline,
            numerator, denominator, createdBy, Timestamp.from(Instant.now()));
        return trial(retailerId, opportunity.id()).orElseThrow();
    }

    private static String metricName(RetailerOpportunityDtos.Opportunity opportunity) {
        return switch (opportunity.type()) {
            case CROSS_SELL -> "JOINT_BASKET_RATE";
            case BEVERAGE_ATTACHMENT -> "BEVERAGE_ATTACHMENT";
            case PRODUCT_TREND -> "PRODUCT_BASKET_RATE";
            case TIME_PATTERN -> "PEAK_WINDOW_SHARE";
        };
    }

    private static BigDecimal baselineMetric(RetailerOpportunityDtos.Opportunity opportunity) {
        return switch (opportunity.type()) {
            case CROSS_SELL -> opportunity.metrics().get("supportPercentage");
            case BEVERAGE_ATTACHMENT -> opportunity.metrics().get("attachmentPercentage");
            case PRODUCT_TREND -> opportunity.metrics().get("currentBasketPercentage");
            case TIME_PATTERN -> opportunity.metrics().get("peakSharePercentage");
        };
    }

    private static long baselineNumerator(RetailerOpportunityDtos.Opportunity opportunity) {
        return switch (opportunity.type()) {
            case CROSS_SELL -> opportunity.metrics().get("jointBaskets").longValueExact();
            case BEVERAGE_ATTACHMENT -> opportunity.metrics().get("attachedBaskets").longValueExact();
            case PRODUCT_TREND -> opportunity.metrics().get("currentBaskets").longValueExact();
            case TIME_PATTERN -> opportunity.metrics().get("supportingBaskets").longValueExact();
        };
    }

    private static long baselineDenominator(RetailerOpportunityDtos.Opportunity opportunity) {
        return switch (opportunity.type()) {
            case CROSS_SELL, PRODUCT_TREND -> opportunity.evidence().receiptCount();
            case BEVERAGE_ATTACHMENT -> opportunity.metrics().get("categoryBaskets").longValueExact();
            case TIME_PATTERN -> opportunity.metrics().get("pairedBaskets").longValueExact();
        };
    }

    private static TrialRow trial(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new TrialRow(
            rs.getObject("id", UUID.class), rs.getString("opportunity_key"), rs.getString("opportunity_type"),
            rs.getString("title"), rs.getString("store_id"), rs.getString("product_a"), rs.getString("product_b"),
            rs.getString("action_title"), rs.getDate("start_date").toLocalDate(), rs.getDate("end_date").toLocalDate(),
            rs.getDate("baseline_start").toLocalDate(), rs.getDate("baseline_end").toLocalDate(),
            rs.getString("baseline_metric"), rs.getBigDecimal("baseline_value"), rs.getLong("baseline_numerator"),
            rs.getLong("baseline_denominator"), rs.getTimestamp("created_at").toInstant()
        );
    }

    record TrialRow(
        UUID id, String opportunityKey, String opportunityType, String title, String storeId,
        String productA, String productB, String actionTitle, LocalDate startDate, LocalDate endDate,
        LocalDate baselineStart, LocalDate baselineEnd, String baselineMetric, BigDecimal baselineValue,
        long baselineNumerator, long baselineDenominator, Instant createdAt
    ) {}
}
