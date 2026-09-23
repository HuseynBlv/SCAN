package az.cci.scan.analytics;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
class AnalyticsQueryRepository {

    private static final String BASKETS_SQL = """
        select
            r.id as receipt_id,
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
        order by r.transaction_timestamp, r.id
        """;

    private static final String LINE_STATS_SQL = """
        select
            count(tl.id) as total_lines,
            count(cp.id) as mapped_lines
        from receipt r
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id = ?
        """;

    // A companion doesn't need to be mapped to appear: an unmapped one still shows under its raw
    // source name (same fallback the retailer's own dashboard already uses), rather than a basket
    // silently contributing nothing to Basket DNA just because its non-CCI items aren't cataloged
    // yet. Only the CCI side of the basket has to be mapped - that's what makes it CCI-relevant.
    private static final String COMPANION_PRODUCTS_SQL = """
        with cci_receipts as (
            select distinct tl.receipt_id
            from receipt r
            join transaction_line tl on tl.receipt_id = r.id
            join retailer_product rp on rp.id = tl.retailer_product_id
            join canonical_product cp on cp.id = rp.canonical_product_id
            where r.retailer_id = ?
              and cp.is_cci = true
        )
        select
            coalesce(cp.normalized_name, rp.original_product_name) as label,
            count(distinct companion_line.receipt_id) as basket_count
        from cci_receipts cci
        join transaction_line companion_line on companion_line.receipt_id = cci.receipt_id
        join retailer_product rp on rp.id = companion_line.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where coalesce(cp.is_cci, false) = false
        group by coalesce(cp.normalized_name, rp.original_product_name)
        order by basket_count desc, label asc
        limit 10
        """;

    private static final String COMPANION_CATEGORIES_SQL = """
        with cci_receipts as (
            select distinct tl.receipt_id
            from receipt r
            join transaction_line tl on tl.receipt_id = r.id
            join retailer_product rp on rp.id = tl.retailer_product_id
            join canonical_product cp on cp.id = rp.canonical_product_id
            where r.retailer_id = ?
              and cp.is_cci = true
        )
        select
            coalesce(
                nullif(trim(cp.category), ''),
                nullif(trim(rp.original_category), ''),
                'Unmapped'
            ) as label,
            count(distinct companion_line.receipt_id) as basket_count
        from cci_receipts cci
        join transaction_line companion_line on companion_line.receipt_id = cci.receipt_id
        join retailer_product rp on rp.id = companion_line.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where coalesce(cp.is_cci, false) = false
        group by coalesce(
            nullif(trim(cp.category), ''),
            nullif(trim(rp.original_category), ''),
            'Unmapped'
        )
        order by basket_count desc, label asc
        limit 10
        """;

    private static final String CCI_SKUS_SQL = """
        select
            cp.id as product_id,
            cp.normalized_name as product,
            count(distinct r.id) as basket_count,
            sum(tl.quantity) as quantity,
            sum(tl.line_total) as revenue
        from receipt r
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id = ?
          and cp.is_cci = true
        group by cp.id, cp.normalized_name
        order by basket_count desc, product asc
        """;

    private final JdbcTemplate jdbcTemplate;

    AnalyticsQueryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    List<AnalyticsBasketRow> findBasketsByRetailerId(UUID retailerId) {
        return jdbcTemplate.query(BASKETS_SQL, (resultSet, rowNumber) -> new AnalyticsBasketRow(
            resultSet.getObject("receipt_id", UUID.class),
            resultSet.getTimestamp("transaction_timestamp").toInstant(),
            resultSet.getString("currency"),
            resultSet.getBigDecimal("basket_value"),
            resultSet.getString("external_store_id"),
            resultSet.getBoolean("contains_cci")
        ), retailerId);
    }

    AnalyticsLineStats lineStats(UUID retailerId) {
        return jdbcTemplate.queryForObject(LINE_STATS_SQL, (resultSet, rowNumber) ->
            new AnalyticsLineStats(
                resultSet.getLong("total_lines"),
                resultSet.getLong("mapped_lines")
            ), retailerId);
    }

    List<NamedBasketCount> findCompanionProducts(UUID retailerId) {
        return namedBasketCounts(COMPANION_PRODUCTS_SQL, retailerId);
    }

    List<NamedBasketCount> findCompanionCategories(UUID retailerId) {
        return namedBasketCounts(COMPANION_CATEGORIES_SQL, retailerId);
    }

    List<AnalyticsCciSkuRow> findCciSkus(UUID retailerId) {
        return jdbcTemplate.query(CCI_SKUS_SQL, (resultSet, rowNumber) -> new AnalyticsCciSkuRow(
            resultSet.getObject("product_id", UUID.class),
            resultSet.getString("product"),
            resultSet.getLong("basket_count"),
            resultSet.getBigDecimal("quantity"),
            resultSet.getBigDecimal("revenue")
        ), retailerId);
    }

    private List<NamedBasketCount> namedBasketCounts(String sql, UUID retailerId) {
        return jdbcTemplate.query(sql, (resultSet, rowNumber) -> new NamedBasketCount(
            resultSet.getString("label"),
            resultSet.getLong("basket_count")
        ), retailerId);
    }

    record AnalyticsBasketRow(
        UUID receiptId,
        Instant transactionTimestamp,
        String currency,
        BigDecimal basketValue,
        String storeId,
        boolean containsCci
    ) {
    }

    record AnalyticsLineStats(long totalLines, long mappedLines) {
    }

    record NamedBasketCount(String label, long basketCount) {
    }

    record AnalyticsCciSkuRow(
        UUID productId,
        String product,
        long basketCount,
        BigDecimal quantity,
        BigDecimal revenue
    ) {
    }
}
