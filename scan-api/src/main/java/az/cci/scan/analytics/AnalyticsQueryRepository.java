package az.cci.scan.analytics;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
class AnalyticsQueryRepository {

    private static final String ANALYTICS_LINES_SQL = """
        select
            r.id as receipt_id,
            r.transaction_timestamp,
            r.currency,
            r.basket_value,
            s.external_store_id,
            tl.id as line_id,
            cp.id as canonical_product_id,
            cp.normalized_name,
            cp.category,
            coalesce(cp.is_cci, false) as is_cci,
            tl.quantity,
            tl.line_total
        from receipt r
        join store s on s.id = r.store_id
        left join transaction_line tl on tl.receipt_id = r.id
        left join retailer_product rp on rp.id = tl.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id = ?
        order by r.transaction_timestamp, r.id, tl.source_row_number
        """;

    private final JdbcTemplate jdbcTemplate;

    AnalyticsQueryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    List<AnalyticsLineRow> findByRetailerId(UUID retailerId) {
        return jdbcTemplate.query(ANALYTICS_LINES_SQL, (resultSet, rowNumber) -> {
            UUID lineId = resultSet.getObject("line_id", UUID.class);
            return new AnalyticsLineRow(
                resultSet.getObject("receipt_id", UUID.class),
                resultSet.getTimestamp("transaction_timestamp").toInstant(),
                resultSet.getString("currency"),
                resultSet.getBigDecimal("basket_value"),
                resultSet.getString("external_store_id"),
                lineId,
                resultSet.getObject("canonical_product_id", UUID.class),
                resultSet.getString("normalized_name"),
                resultSet.getString("category"),
                resultSet.getBoolean("is_cci"),
                lineId == null ? null : resultSet.getBigDecimal("quantity"),
                lineId == null ? null : resultSet.getBigDecimal("line_total")
            );
        }, retailerId);
    }

    record AnalyticsLineRow(
        UUID receiptId,
        Instant transactionTimestamp,
        String currency,
        BigDecimal basketValue,
        String storeId,
        UUID lineId,
        UUID canonicalProductId,
        String normalizedName,
        String category,
        boolean cci,
        BigDecimal quantity,
        BigDecimal lineTotal
    ) {
    }
}
