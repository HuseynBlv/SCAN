package az.cci.scan.intelligence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Bounded-date-range queries that the rest of the "analytics" package doesn't have - every query
 * in {@code AnalyticsService} is all-time. This repository is what makes "what changed" a real,
 * computed comparison instead of a guess: the same shape of query run twice, once over a recent
 * window and once over the prior window of equal length.
 */
@Repository
class IntelligenceQueryRepository {

    private static final String LATEST_TRANSACTION_SQL = """
        select max(r.transaction_timestamp) as latest
        from receipt r
        where r.retailer_id = ?
        """;

    private static final String BASKETS_IN_RANGE_SQL = """
        select
            r.id as receipt_id,
            r.transaction_timestamp,
            s.external_store_id,
            exists (
                select 1
                from transaction_line cci_line
                join retailer_product cci_retailer_product
                    on cci_retailer_product.id = cci_line.retailer_product_id
                join canonical_product cci_product
                    on cci_product.id = cci_retailer_product.canonical_product_id
                where cci_line.receipt_id = r.id
                  and cci_product.is_cci = true
            ) as contains_cci
        from receipt r
        join store s on s.id = r.store_id
        where r.retailer_id = ?
          and r.transaction_timestamp >= ?
          and r.transaction_timestamp < ?
        order by r.transaction_timestamp, r.id
        """;

    private static final String CCI_PRODUCT_METRICS_IN_RANGE_SQL = """
        select
            cp.id as product_id,
            cp.normalized_name as product,
            coalesce(nullif(trim(cp.category), ''), 'Unmapped') as category,
            count(distinct r.id) as basket_count,
            sum(tl.quantity) as quantity,
            sum(tl.line_total) as revenue
        from receipt r
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id = ?
          and cp.is_cci = true
          and r.transaction_timestamp >= ?
          and r.transaction_timestamp < ?
        group by cp.id, cp.normalized_name, cp.category
        order by basket_count desc, product asc
        """;

    // Matches by the same coalesced label the dashboard already shows (canonical name first,
    // falling back to the raw source name), so this works for a mapped CCI product or for any
    // companion product a user might want to compare, not only catalogued SKUs. line_total rides
    // along so a caller can sum real revenue for an arbitrary store subset (activations) without a
    // second query - basket-presence callers simply ignore it.
    private static final String PRODUCT_STORE_PRESENCE_IN_RANGE_SQL = """
        select
            s.external_store_id as external_store_id,
            r.id as receipt_id,
            tl.line_total as line_total
        from receipt r
        join store s on s.id = r.store_id
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id = ?
          and coalesce(cp.normalized_name, rp.original_product_name) = ?
          and r.transaction_timestamp >= ?
          and r.transaction_timestamp < ?
        """;

    private final JdbcTemplate jdbcTemplate;

    IntelligenceQueryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    Optional<Instant> latestTransactionTimestamp(UUID retailerId) {
        Timestamp latest = jdbcTemplate.queryForObject(LATEST_TRANSACTION_SQL, Timestamp.class, retailerId);
        return Optional.ofNullable(latest).map(Timestamp::toInstant);
    }

    List<RangeBasketRow> basketsInRange(UUID retailerId, Instant start, Instant end) {
        return jdbcTemplate.query(BASKETS_IN_RANGE_SQL, (resultSet, rowNumber) -> new RangeBasketRow(
            resultSet.getObject("receipt_id", UUID.class),
            resultSet.getTimestamp("transaction_timestamp").toInstant(),
            resultSet.getString("external_store_id"),
            resultSet.getBoolean("contains_cci")
        ), retailerId, Timestamp.from(start), Timestamp.from(end));
    }

    List<CciProductRangeRow> cciProductMetricsInRange(UUID retailerId, Instant start, Instant end) {
        return jdbcTemplate.query(CCI_PRODUCT_METRICS_IN_RANGE_SQL, (resultSet, rowNumber) -> new CciProductRangeRow(
            resultSet.getObject("product_id", UUID.class),
            resultSet.getString("product"),
            resultSet.getString("category"),
            resultSet.getLong("basket_count"),
            resultSet.getBigDecimal("quantity"),
            resultSet.getBigDecimal("revenue")
        ), retailerId, Timestamp.from(start), Timestamp.from(end));
    }

    List<ProductStorePresenceRow> productStorePresenceInRange(
        UUID retailerId, String productName, Instant start, Instant end
    ) {
        return jdbcTemplate.query(PRODUCT_STORE_PRESENCE_IN_RANGE_SQL, (resultSet, rowNumber) ->
            new ProductStorePresenceRow(
                resultSet.getString("external_store_id"),
                resultSet.getObject("receipt_id", UUID.class),
                resultSet.getBigDecimal("line_total")
            ), retailerId, productName, Timestamp.from(start), Timestamp.from(end));
    }

    record RangeBasketRow(UUID receiptId, Instant transactionTimestamp, String externalStoreId, boolean containsCci) {
    }

    record CciProductRangeRow(
        UUID productId,
        String product,
        String category,
        long basketCount,
        BigDecimal quantity,
        BigDecimal revenue
    ) {
    }

    record ProductStorePresenceRow(String externalStoreId, UUID receiptId, BigDecimal lineTotal) {
    }
}
