package az.cci.scan.network;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every query here is scoped to a SET of retailers (the CCI account's full accessible network),
 * not one - this is what makes "all stores" a real default instead of a manual switcher. It uses
 * {@link NamedParameterJdbcTemplate} specifically because Spring expands a {@code List} bound to
 * an {@code in (:retailerIds)} named parameter into the right number of placeholders on both H2
 * (tests) and Postgres (production), which a plain positional {@code JdbcTemplate} cannot do for
 * a variable-length list without hand-building SQL per call.
 *
 * <p>A store's identity is only unique within one retailer ({@code external_store_id}), so every
 * row here carries the owning retailer's code alongside it - the network UI shows one flat store
 * list, but drill-down actions (create a field check, open an investigation) still need to resolve
 * back to a specific retailer under the hood.
 */
@Repository
class NetworkQueryRepository {

    private static final String LATEST_TRANSACTION_SQL = """
        select max(r.transaction_timestamp) as latest
        from receipt r
        where r.retailer_id in (:retailerIds)
        """;

    private static final String BASKETS_IN_RANGE_SQL = """
        select
            r.id as receipt_id,
            r.transaction_timestamp,
            ret.code as retailer_code,
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
        join retailer ret on ret.id = r.retailer_id
        where r.retailer_id in (:retailerIds)
          and r.transaction_timestamp >= :start
          and r.transaction_timestamp < :end
        """;

    private static final String CCI_PRODUCT_METRICS_IN_RANGE_SQL = """
        select
            cp.id as product_id,
            cp.normalized_name as product,
            coalesce(nullif(trim(cp.category), ''), 'Unmapped') as category,
            coalesce(nullif(trim(cp.brand), ''), 'Unbranded') as brand,
            count(distinct r.id) as basket_count,
            sum(tl.quantity) as quantity,
            sum(tl.line_total) as revenue
        from receipt r
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id in (:retailerIds)
          and cp.is_cci = true
          and r.transaction_timestamp >= :start
          and r.transaction_timestamp < :end
        group by cp.id, cp.normalized_name, cp.category, cp.brand
        order by basket_count desc, product asc
        """;

    private static final String PRODUCT_STORE_PRESENCE_IN_RANGE_SQL = """
        select
            ret.code as retailer_code,
            s.external_store_id as external_store_id,
            r.id as receipt_id
        from receipt r
        join store s on s.id = r.store_id
        join retailer ret on ret.id = r.retailer_id
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id in (:retailerIds)
          and coalesce(cp.normalized_name, rp.original_product_name) = :productName
          and r.transaction_timestamp >= :start
          and r.transaction_timestamp < :end
        """;

    private static final String LINE_STATS_SQL = """
        select
            count(tl.id) as total_lines,
            count(cp.id) as mapped_lines
        from receipt r
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id in (:retailerIds)
        """;

    private static final String STORE_CCI_PRODUCT_METRICS_IN_RANGE_SQL = """
        select
            cp.id as product_id,
            cp.normalized_name as product,
            coalesce(nullif(trim(cp.category), ''), 'Unmapped') as category,
            coalesce(nullif(trim(cp.brand), ''), 'Unbranded') as brand,
            count(distinct r.id) as basket_count,
            sum(tl.quantity) as quantity,
            sum(tl.line_total) as revenue
        from receipt r
        join store s on s.id = r.store_id
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        join canonical_product cp on cp.id = rp.canonical_product_id
        where s.retailer_id = :retailerId
          and s.external_store_id = :externalStoreId
          and cp.is_cci = true
          and r.transaction_timestamp >= :start
          and r.transaction_timestamp < :end
        group by cp.id, cp.normalized_name, cp.category, cp.brand
        order by basket_count desc, product asc
        """;

    // Same cci_receipts-then-companion-join shape as the single-retailer AnalyticsQueryRepository,
    // scoped to one store instead of one retailer's whole basket set.
    private static final String STORE_COMPANION_CATEGORIES_SQL = """
        with cci_receipts as (
            select distinct tl.receipt_id
            from receipt r
            join store s on s.id = r.store_id
            join transaction_line tl on tl.receipt_id = r.id
            join retailer_product rp on rp.id = tl.retailer_product_id
            join canonical_product cp on cp.id = rp.canonical_product_id
            where s.retailer_id = :retailerId
              and s.external_store_id = :externalStoreId
              and cp.is_cci = true
              and r.transaction_timestamp >= :start
              and r.transaction_timestamp < :end
        )
        select
            coalesce(nullif(trim(cp.category), ''), nullif(trim(rp.original_category), ''), 'Unmapped') as label,
            count(distinct companion_line.receipt_id) as basket_count
        from cci_receipts cci
        join transaction_line companion_line on companion_line.receipt_id = cci.receipt_id
        join retailer_product rp on rp.id = companion_line.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where coalesce(cp.is_cci, false) = false
        group by coalesce(nullif(trim(cp.category), ''), nullif(trim(rp.original_category), ''), 'Unmapped')
        order by basket_count desc, label asc
        limit 5
        """;

    private static final String STORE_LINE_STATS_SQL = """
        select
            count(tl.id) as total_lines,
            count(cp.id) as mapped_lines
        from receipt r
        join store s on s.id = r.store_id
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where s.retailer_id = :retailerId
          and s.external_store_id = :externalStoreId
        """;

    private static final String PRODUCT_COMPANIONS_SQL = """
        with product_receipts as (
            select distinct r.id as receipt_id
            from receipt r
            join transaction_line tl on tl.receipt_id = r.id
            join retailer_product rp on rp.id = tl.retailer_product_id
            left join canonical_product cp on cp.id = rp.canonical_product_id
            where r.retailer_id in (:retailerIds)
              and coalesce(cp.normalized_name, rp.original_product_name) = :productName
              and r.transaction_timestamp >= :start
              and r.transaction_timestamp < :end
        )
        select
            coalesce(cp.normalized_name, rp.original_product_name) as label,
            count(distinct companion_line.receipt_id) as basket_count
        from product_receipts pr
        join transaction_line companion_line on companion_line.receipt_id = pr.receipt_id
        join retailer_product rp on rp.id = companion_line.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where coalesce(cp.normalized_name, rp.original_product_name) <> :productName
        group by coalesce(cp.normalized_name, rp.original_product_name)
        order by basket_count desc, label asc
        limit 10
        """;

    private static final String PRODUCT_COMPANION_CATEGORIES_SQL = """
        with product_receipts as (
            select distinct r.id as receipt_id
            from receipt r
            join transaction_line tl on tl.receipt_id = r.id
            join retailer_product rp on rp.id = tl.retailer_product_id
            left join canonical_product cp on cp.id = rp.canonical_product_id
            where r.retailer_id in (:retailerIds)
              and coalesce(cp.normalized_name, rp.original_product_name) = :productName
              and r.transaction_timestamp >= :start
              and r.transaction_timestamp < :end
        )
        select
            coalesce(nullif(trim(cp.category), ''), nullif(trim(rp.original_category), ''), 'Unmapped') as label,
            count(distinct companion_line.receipt_id) as basket_count
        from product_receipts pr
        join transaction_line companion_line on companion_line.receipt_id = pr.receipt_id
        join retailer_product rp on rp.id = companion_line.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where coalesce(cp.normalized_name, rp.original_product_name) <> :productName
        group by coalesce(nullif(trim(cp.category), ''), nullif(trim(rp.original_category), ''), 'Unmapped')
        order by basket_count desc, label asc
        limit 5
        """;

    // One row per receipt that contains the product, with the owning retailer's own timezone, so
    // the service can bucket into local-time dayparts (a receipt in Baku and one in another zone
    // must not be compared in UTC hours).
    private static final String PRODUCT_RECEIPT_TIMESTAMPS_SQL = """
        select distinct r.id as receipt_id, r.transaction_timestamp, ret.zone_id as zone_id
        from receipt r
        join retailer ret on ret.id = r.retailer_id
        join transaction_line tl on tl.receipt_id = r.id
        join retailer_product rp on rp.id = tl.retailer_product_id
        left join canonical_product cp on cp.id = rp.canonical_product_id
        where r.retailer_id in (:retailerIds)
          and coalesce(cp.normalized_name, rp.original_product_name) = :productName
          and r.transaction_timestamp >= :start
          and r.transaction_timestamp < :end
        """;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    NetworkQueryRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    Optional<Instant> latestTransactionTimestamp(List<UUID> retailerIds) {
        Timestamp latest = jdbcTemplate.queryForObject(
            LATEST_TRANSACTION_SQL, params(retailerIds), Timestamp.class
        );
        return Optional.ofNullable(latest).map(Timestamp::toInstant);
    }

    List<NetworkBasketRow> basketsInRange(List<UUID> retailerIds, Instant start, Instant end) {
        return jdbcTemplate.query(BASKETS_IN_RANGE_SQL, params(retailerIds, start, end), (resultSet, rowNumber) ->
            new NetworkBasketRow(
                resultSet.getObject("receipt_id", UUID.class),
                resultSet.getTimestamp("transaction_timestamp").toInstant(),
                resultSet.getString("retailer_code"),
                resultSet.getString("external_store_id"),
                resultSet.getBoolean("contains_cci")
            ));
    }

    List<NetworkProductRow> cciProductMetricsInRange(List<UUID> retailerIds, Instant start, Instant end) {
        return jdbcTemplate.query(CCI_PRODUCT_METRICS_IN_RANGE_SQL, params(retailerIds, start, end), (resultSet, rowNumber) ->
            new NetworkProductRow(
                resultSet.getObject("product_id", UUID.class),
                resultSet.getString("product"),
                resultSet.getString("category"),
                resultSet.getString("brand"),
                resultSet.getLong("basket_count"),
                resultSet.getBigDecimal("quantity"),
                resultSet.getBigDecimal("revenue")
            ));
    }

    List<NetworkProductPresenceRow> productStorePresenceInRange(
        List<UUID> retailerIds, String productName, Instant start, Instant end
    ) {
        MapSqlParameterSource source = params(retailerIds, start, end).addValue("productName", productName);
        return jdbcTemplate.query(PRODUCT_STORE_PRESENCE_IN_RANGE_SQL, source, (resultSet, rowNumber) ->
            new NetworkProductPresenceRow(
                resultSet.getString("retailer_code"),
                resultSet.getString("external_store_id"),
                resultSet.getObject("receipt_id", UUID.class)
            ));
    }

    NetworkLineStats lineStats(List<UUID> retailerIds) {
        return jdbcTemplate.queryForObject(LINE_STATS_SQL, params(retailerIds), (resultSet, rowNumber) ->
            new NetworkLineStats(
                resultSet.getLong("total_lines"),
                resultSet.getLong("mapped_lines")
            ));
    }

    List<NetworkProductRow> cciProductMetricsForStoreInRange(
        UUID retailerId, String externalStoreId, Instant start, Instant end
    ) {
        MapSqlParameterSource source = storeParams(retailerId, externalStoreId)
            .addValue("start", Timestamp.from(start))
            .addValue("end", Timestamp.from(end));
        return jdbcTemplate.query(STORE_CCI_PRODUCT_METRICS_IN_RANGE_SQL, source, (resultSet, rowNumber) ->
            new NetworkProductRow(
                resultSet.getObject("product_id", UUID.class),
                resultSet.getString("product"),
                resultSet.getString("category"),
                resultSet.getString("brand"),
                resultSet.getLong("basket_count"),
                resultSet.getBigDecimal("quantity"),
                resultSet.getBigDecimal("revenue")
            ));
    }

    List<NamedBasketCount> companionCategoriesForStoreInRange(
        UUID retailerId, String externalStoreId, Instant start, Instant end
    ) {
        MapSqlParameterSource source = storeParams(retailerId, externalStoreId)
            .addValue("start", Timestamp.from(start))
            .addValue("end", Timestamp.from(end));
        return namedBasketCounts(STORE_COMPANION_CATEGORIES_SQL, source);
    }

    NetworkLineStats lineStatsForStore(UUID retailerId, String externalStoreId) {
        return jdbcTemplate.queryForObject(STORE_LINE_STATS_SQL, storeParams(retailerId, externalStoreId), (resultSet, rowNumber) ->
            new NetworkLineStats(
                resultSet.getLong("total_lines"),
                resultSet.getLong("mapped_lines")
            ));
    }

    List<NamedBasketCount> companionProductsForProductInRange(
        List<UUID> retailerIds, String productName, Instant start, Instant end
    ) {
        return namedBasketCounts(PRODUCT_COMPANIONS_SQL, productParams(retailerIds, productName, start, end));
    }

    List<NamedBasketCount> companionCategoriesForProductInRange(
        List<UUID> retailerIds, String productName, Instant start, Instant end
    ) {
        return namedBasketCounts(PRODUCT_COMPANION_CATEGORIES_SQL, productParams(retailerIds, productName, start, end));
    }

    List<ProductReceiptRow> productReceiptTimestampsInRange(
        List<UUID> retailerIds, String productName, Instant start, Instant end
    ) {
        return jdbcTemplate.query(
            PRODUCT_RECEIPT_TIMESTAMPS_SQL, productParams(retailerIds, productName, start, end),
            (resultSet, rowNumber) -> new ProductReceiptRow(
                resultSet.getObject("receipt_id", UUID.class),
                resultSet.getTimestamp("transaction_timestamp").toInstant(),
                resultSet.getString("zone_id")
            ));
    }

    private List<NamedBasketCount> namedBasketCounts(String sql, MapSqlParameterSource params) {
        return jdbcTemplate.query(sql, params, (resultSet, rowNumber) -> new NamedBasketCount(
            resultSet.getString("label"),
            resultSet.getLong("basket_count")
        ));
    }

    private static MapSqlParameterSource params(List<UUID> retailerIds) {
        return new MapSqlParameterSource("retailerIds", retailerIds);
    }

    private static MapSqlParameterSource params(List<UUID> retailerIds, Instant start, Instant end) {
        return params(retailerIds)
            .addValue("start", Timestamp.from(start))
            .addValue("end", Timestamp.from(end));
    }

    private static MapSqlParameterSource storeParams(UUID retailerId, String externalStoreId) {
        return new MapSqlParameterSource("retailerId", retailerId).addValue("externalStoreId", externalStoreId);
    }

    private static MapSqlParameterSource productParams(List<UUID> retailerIds, String productName, Instant start, Instant end) {
        return params(retailerIds, start, end).addValue("productName", productName);
    }

    record NetworkBasketRow(
        UUID receiptId, Instant transactionTimestamp, String retailerCode, String externalStoreId, boolean containsCci
    ) {
    }

    record NetworkProductRow(
        UUID productId, String product, String category, String brand, long basketCount, BigDecimal quantity, BigDecimal revenue
    ) {
    }

    record NetworkProductPresenceRow(String retailerCode, String externalStoreId, UUID receiptId) {
    }

    record NetworkLineStats(long totalLines, long mappedLines) {
    }

    record NamedBasketCount(String label, long basketCount) {
    }

    record ProductReceiptRow(UUID receiptId, Instant transactionTimestamp, String zoneId) {
    }
}
