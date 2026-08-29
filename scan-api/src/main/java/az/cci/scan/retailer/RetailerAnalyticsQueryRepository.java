package az.cci.scan.retailer;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
class RetailerAnalyticsQueryRepository {

    private static final String BASKETS_SQL = """
        select
            r.transaction_timestamp,
            r.currency,
            r.basket_value,
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
        order by r.transaction_timestamp, r.id
        """;

    private static final String LINE_STATS_SQL = """
        select
            count(tl.id) as total_lines,
            count(cp.id) as mapped_lines,
            coalesce(sum(tl.quantity), 0) as total_quantity
        from receipt r
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id = ?
          and r.transaction_timestamp >= ?
        """;

    private static final String TOP_PRODUCTS_SQL = """
        select
            coalesce(cp.normalized_name, rp.original_product_name) as product_name,
            coalesce(nullif(trim(cp.category), ''), 'Unmapped') as category,
            count(distinct r.id) as basket_count,
            sum(tl.quantity) as quantity,
            sum(tl.line_total) as revenue
        from receipt r
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id = ?
          and r.transaction_timestamp >= ?
        group by coalesce(cp.normalized_name, rp.original_product_name),
                 coalesce(nullif(trim(cp.category), ''), 'Unmapped')
        order by revenue desc, quantity desc, product_name asc
        limit 10
        """;

    private static final String TOP_CATEGORIES_SQL = """
        select
            coalesce(nullif(trim(cp.category), ''), 'Unmapped') as category,
            count(distinct r.id) as basket_count,
            sum(tl.quantity) as quantity,
            sum(tl.line_total) as revenue
        from receipt r
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id = ?
          and r.transaction_timestamp >= ?
        group by coalesce(nullif(trim(cp.category), ''), 'Unmapped')
        order by revenue desc, quantity desc, category asc
        limit 10
        """;

    private final JdbcTemplate jdbcTemplate;

    RetailerAnalyticsQueryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    List<BasketRow> findBaskets(UUID retailerId, Instant startInclusive) {
        return jdbcTemplate.query(BASKETS_SQL, (resultSet, rowNumber) -> new BasketRow(
            resultSet.getTimestamp("transaction_timestamp").toInstant(),
            resultSet.getString("currency"),
            resultSet.getBigDecimal("basket_value"),
            resultSet.getString("external_store_id"),
            resultSet.getBoolean("contains_cci")
        ), retailerId, Timestamp.from(startInclusive));
    }

    LineStats lineStats(UUID retailerId, Instant startInclusive) {
        return jdbcTemplate.queryForObject(LINE_STATS_SQL, (resultSet, rowNumber) -> new LineStats(
            resultSet.getLong("total_lines"),
            resultSet.getLong("mapped_lines"),
            resultSet.getBigDecimal("total_quantity")
        ), retailerId, Timestamp.from(startInclusive));
    }

    List<RetailerAnalyticsDtos.ProductMetric> topProducts(UUID retailerId, Instant startInclusive) {
        return jdbcTemplate.query(TOP_PRODUCTS_SQL, (resultSet, rowNumber) ->
            new RetailerAnalyticsDtos.ProductMetric(
                resultSet.getString("product_name"),
                resultSet.getString("category"),
                resultSet.getLong("basket_count"),
                resultSet.getBigDecimal("quantity"),
                resultSet.getBigDecimal("revenue")
            ), retailerId, Timestamp.from(startInclusive));
    }

    List<RetailerAnalyticsDtos.CategoryMetric> topCategories(UUID retailerId, Instant startInclusive) {
        return jdbcTemplate.query(TOP_CATEGORIES_SQL, (resultSet, rowNumber) ->
            new RetailerAnalyticsDtos.CategoryMetric(
                resultSet.getString("category"),
                resultSet.getLong("basket_count"),
                resultSet.getBigDecimal("quantity"),
                resultSet.getBigDecimal("revenue")
            ), retailerId, Timestamp.from(startInclusive));
    }

    record BasketRow(
        Instant timestamp,
        String currency,
        BigDecimal basketValue,
        String storeId,
        boolean containsCci
    ) {
    }

    record LineStats(long totalLines, long mappedLines, BigDecimal totalQuantity) {
    }
}
