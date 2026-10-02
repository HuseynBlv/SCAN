package az.cci.scan.network;

import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.Store;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
import az.cci.scan.network.NetworkDtos.BriefItem;
import az.cci.scan.network.NetworkDtos.CategoryMover;
import az.cci.scan.network.NetworkDtos.NamedBasketCount;
import az.cci.scan.network.NetworkDtos.NetworkOverview;
import az.cci.scan.network.NetworkDtos.ProductDetail;
import az.cci.scan.network.NetworkDtos.ProductStoreDistribution;
import az.cci.scan.network.NetworkDtos.StoreDetail;
import az.cci.scan.network.NetworkDtos.StoreProduct;
import az.cci.scan.network.NetworkDtos.StoreRanking;
import az.cci.scan.network.NetworkQueryRepository.NetworkBasketRow;
import az.cci.scan.network.NetworkQueryRepository.NetworkProductPresenceRow;
import az.cci.scan.network.NetworkQueryRepository.NetworkProductRow;
import az.cci.scan.network.NetworkQueryRepository.ProductReceiptRow;
import az.cci.scan.repository.StoreRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The backbone of the network-level Overview: every query here is scoped to the CCI account's
 * full set of accessible retailers, resolved once by the controller via
 * {@code TenantAccessService.cciRetailers} and passed in - there is no per-request retailer
 * switch anywhere in this class. A store is only unique within its retailer, so every per-store
 * result carries the owning retailer's code; a product/category result is a genuine network-wide
 * aggregate with no retailer identity at all.
 */
@Service
public class NetworkAnalyticsService {

    /** Same support floor InsightRules and ChangeDetectionService already use - a product or
     * category with fewer prior baskets than this cannot support a real trend claim. */
    private static final long MIN_SAMPLE_FOR_TREND = 5;
    private static final double MEANINGFUL_CHANGE_PCT = 10.0;
    private static final double STORE_NEEDS_ATTENTION_POINTS = -5.0;
    private static final double STORE_IMPROVING_POINTS = 5.0;
    private static final double HEALTHY_MAPPING_PCT = 90.0;
    private static final int STORE_CONCENTRATION_LIMIT = 3;

    private final NetworkQueryRepository queryRepository;
    private final StoreRepository storeRepository;

    NetworkAnalyticsService(NetworkQueryRepository queryRepository, StoreRepository storeRepository) {
        this.queryRepository = queryRepository;
        this.storeRepository = storeRepository;
    }

    public NetworkOverview overview(List<Retailer> retailers, int periodDays) {
        List<UUID> retailerIds = ids(retailers);
        Window window = resolveWindow(retailerIds, periodDays);
        List<NetworkBasketRow> recent = queryRepository.basketsInRange(retailerIds, window.recentStart(), window.recentEnd());
        List<NetworkBasketRow> prior = queryRepository.basketsInRange(retailerIds, window.priorStart(), window.priorEnd());

        long recentTotal = recent.size();
        long recentCci = recent.stream().filter(NetworkBasketRow::containsCci).count();
        long priorTotal = prior.size();
        long priorCci = prior.stream().filter(NetworkBasketRow::containsCci).count();
        double recentPct = pct(recentCci, recentTotal);
        double priorPct = pct(priorCci, priorTotal);

        long storesReporting = recent.stream().map(row -> row.retailerCode() + "/" + row.externalStoreId()).distinct().count();

        var lineStats = queryRepository.lineStats(retailerIds);
        double coverage = pct(lineStats.mappedLines(), lineStats.totalLines());

        return new NetworkOverview(
            periodDays, storesReporting, recentTotal, recentCci, recentPct, priorPct, recentPct - priorPct,
            coverage, Instant.now()
        );
    }

    public List<StoreRanking> storeRanking(List<Retailer> retailers, int periodDays) {
        List<UUID> retailerIds = ids(retailers);
        Window window = resolveWindow(retailerIds, periodDays);
        List<NetworkBasketRow> recent = queryRepository.basketsInRange(retailerIds, window.recentStart(), window.recentEnd());
        List<NetworkBasketRow> prior = queryRepository.basketsInRange(retailerIds, window.priorStart(), window.priorEnd());

        Map<String, long[]> recentByStore = groupStoreCounts(recent);
        Map<String, long[]> priorByStore = groupStoreCounts(prior);

        java.util.Set<String> storeKeys = new java.util.LinkedHashSet<>();
        storeKeys.addAll(recentByStore.keySet());
        storeKeys.addAll(priorByStore.keySet());

        List<StoreRanking> rankings = new ArrayList<>();
        for (String key : storeKeys) {
            String[] parts = key.split("/", 2);
            long[] r = recentByStore.getOrDefault(key, new long[] {0, 0});
            long[] p = priorByStore.getOrDefault(key, new long[] {0, 0});
            double recentPenetration = pct(r[1], r[0]);
            double priorPenetration = pct(p[1], p[0]);
            double change = recentPenetration - priorPenetration;
            String status = r[0] == 0 ? "NOT_REPORTING"
                : change <= STORE_NEEDS_ATTENTION_POINTS ? "NEEDS_ATTENTION"
                : change >= STORE_IMPROVING_POINTS ? "IMPROVING"
                : "STABLE";
            rankings.add(new StoreRanking(parts[0], parts[1], r[0], r[1], recentPenetration, p[0], p[1], priorPenetration, change, status));
        }
        rankings.sort(Comparator.comparingDouble(StoreRanking::recentPenetrationPct).reversed());
        return rankings;
    }

    public List<ProductMover> productMovers(List<Retailer> retailers, int periodDays, int limit) {
        List<UUID> retailerIds = ids(retailers);
        Window window = resolveWindow(retailerIds, periodDays);
        List<NetworkProductRow> recent = queryRepository.cciProductMetricsInRange(retailerIds, window.recentStart(), window.recentEnd());
        List<NetworkProductRow> prior = queryRepository.cciProductMetricsInRange(retailerIds, window.priorStart(), window.priorEnd());
        Map<String, NetworkProductRow> recentByName = recent.stream()
            .collect(Collectors.toMap(NetworkProductRow::product, row -> row, (a, b) -> a));

        List<ProductMover> movers = new ArrayList<>();
        for (NetworkProductRow p : prior) {
            if (p.basketCount() < MIN_SAMPLE_FOR_TREND) continue;
            NetworkProductRow r = recentByName.get(p.product());
            long recentBaskets = r == null ? 0 : r.basketCount();
            BigDecimal recentRevenue = r == null ? BigDecimal.ZERO : r.revenue();
            double changePct = 100.0 * (recentBaskets - p.basketCount()) / (double) p.basketCount();
            movers.add(new ProductMover(p.product(), p.category(), recentBaskets, p.basketCount(), recentRevenue, p.revenue(), changePct));
        }
        movers.sort(Comparator.comparingDouble((ProductMover m) -> Math.abs(m.basketChangePct())).reversed());
        return movers.stream().limit(limit).toList();
    }

    public List<CategoryMover> categoryMovers(List<Retailer> retailers, int periodDays, int limit) {
        List<UUID> retailerIds = ids(retailers);
        Window window = resolveWindow(retailerIds, periodDays);
        List<NetworkProductRow> recent = queryRepository.cciProductMetricsInRange(retailerIds, window.recentStart(), window.recentEnd());
        List<NetworkProductRow> prior = queryRepository.cciProductMetricsInRange(retailerIds, window.priorStart(), window.priorEnd());

        Map<String, Long> recentByCategory = recent.stream()
            .collect(Collectors.groupingBy(NetworkProductRow::category, Collectors.summingLong(NetworkProductRow::basketCount)));
        Map<String, Long> priorByCategory = prior.stream()
            .collect(Collectors.groupingBy(NetworkProductRow::category, Collectors.summingLong(NetworkProductRow::basketCount)));

        List<CategoryMover> movers = new ArrayList<>();
        for (var entry : priorByCategory.entrySet()) {
            if (entry.getValue() < MIN_SAMPLE_FOR_TREND) continue;
            long recentBaskets = recentByCategory.getOrDefault(entry.getKey(), 0L);
            double changePct = 100.0 * (recentBaskets - entry.getValue()) / (double) entry.getValue();
            movers.add(new CategoryMover(entry.getKey(), recentBaskets, entry.getValue(), changePct));
        }
        movers.sort(Comparator.comparingDouble((CategoryMover m) -> Math.abs(m.basketChangePct())).reversed());
        return movers.stream().limit(limit).toList();
    }

    /**
     * One store's full real picture: its own penetration/trend (from the same basket rows
     * {@link #storeRanking} uses, filtered to this one store), what it sells, what moved, whether
     * its data can be trusted, and a few real stores with the closest current penetration for
     * "compare with similar stores" - never a fabricated "similar" claim.
     */
    public StoreDetail storeDetail(List<Retailer> retailers, Retailer targetRetailer, String externalStoreId, int periodDays) {
        List<UUID> retailerIds = ids(retailers);
        Window window = resolveWindow(retailerIds, periodDays);
        UUID retailerId = targetRetailer.getId();
        String retailerCode = targetRetailer.getCode();

        List<NetworkBasketRow> recentBaskets = queryRepository
            .basketsInRange(List.of(retailerId), window.recentStart(), window.recentEnd()).stream()
            .filter(row -> row.externalStoreId().equals(externalStoreId)).toList();
        List<NetworkBasketRow> priorBaskets = queryRepository
            .basketsInRange(List.of(retailerId), window.priorStart(), window.priorEnd()).stream()
            .filter(row -> row.externalStoreId().equals(externalStoreId)).toList();

        long recentTotal = recentBaskets.size();
        long recentCci = recentBaskets.stream().filter(NetworkBasketRow::containsCci).count();
        long priorTotal = priorBaskets.size();
        long priorCci = priorBaskets.stream().filter(NetworkBasketRow::containsCci).count();
        double recentPct = pct(recentCci, recentTotal);
        double priorPct = pct(priorCci, priorTotal);
        double change = recentPct - priorPct;
        String status = recentTotal == 0 ? "NOT_REPORTING"
            : change <= STORE_NEEDS_ATTENTION_POINTS ? "NEEDS_ATTENTION"
            : change >= STORE_IMPROVING_POINTS ? "IMPROVING"
            : "STABLE";

        List<NetworkProductRow> recentProducts = queryRepository.cciProductMetricsForStoreInRange(
            retailerId, externalStoreId, window.recentStart(), window.recentEnd());
        List<NetworkProductRow> priorProducts = queryRepository.cciProductMetricsForStoreInRange(
            retailerId, externalStoreId, window.priorStart(), window.priorEnd());

        List<StoreProduct> topProducts = recentProducts.stream()
            .map(row -> new StoreProduct(row.product(), row.category(), row.basketCount(), row.quantity(), row.revenue()))
            .toList();

        Map<String, NetworkProductRow> recentByName = recentProducts.stream()
            .collect(Collectors.toMap(NetworkProductRow::product, row -> row, (a, b) -> a));
        List<ProductMover> biggestChanges = new ArrayList<>();
        for (NetworkProductRow prior : priorProducts) {
            if (prior.basketCount() < MIN_SAMPLE_FOR_TREND) continue;
            NetworkProductRow recent = recentByName.get(prior.product());
            long recentCount = recent == null ? 0 : recent.basketCount();
            BigDecimal recentRevenue = recent == null ? BigDecimal.ZERO : recent.revenue();
            double changePct = 100.0 * (recentCount - prior.basketCount()) / (double) prior.basketCount();
            biggestChanges.add(new ProductMover(prior.product(), prior.category(), recentCount, prior.basketCount(), recentRevenue, prior.revenue(), changePct));
        }
        biggestChanges.sort(Comparator.comparingDouble((ProductMover mover) -> Math.abs(mover.basketChangePct())).reversed());

        List<NamedBasketCount> topCompanionCategories = queryRepository
            .companionCategoriesForStoreInRange(retailerId, externalStoreId, window.recentStart(), window.recentEnd())
            .stream()
            .map(row -> new NamedBasketCount(row.label(), row.basketCount()))
            .toList();

        var lineStats = queryRepository.lineStatsForStore(retailerId, externalStoreId);
        double dataCoverage = pct(lineStats.mappedLines(), lineStats.totalLines());

        List<StoreRanking> similarStores = storeRanking(retailers, periodDays).stream()
            .filter(row -> !(row.retailerCode().equals(retailerCode) && row.externalStoreId().equals(externalStoreId)))
            .sorted(Comparator.comparingDouble(row -> Math.abs(row.recentPenetrationPct() - recentPct)))
            .limit(3)
            .toList();

        String storeName = storeRepository.findByRetailerAndExternalStoreId(targetRetailer, externalStoreId)
            .map(Store::getName)
            .orElse(externalStoreId);

        return new StoreDetail(
            retailerCode, externalStoreId, storeName, periodDays,
            recentTotal, recentCci, recentPct, priorTotal, priorCci, priorPct, change, status,
            topProducts, biggestChanges, topCompanionCategories, dataCoverage, similarStores
        );
    }

    /**
     * One CCI product's full real picture across the whole network: its trend, every store that
     * carries it (the frontend sorts this one list two ways for "best"/"weakest", rather than this
     * method prescribing an order), what it's bought alongside, and - only when the sample
     * actually supports a claim - its strongest daypart.
     */
    public ProductDetail productDetail(List<Retailer> retailers, String productName, int periodDays) {
        List<UUID> retailerIds = ids(retailers);
        Window window = resolveWindow(retailerIds, periodDays);

        List<NetworkProductRow> recentAll = queryRepository.cciProductMetricsInRange(retailerIds, window.recentStart(), window.recentEnd());
        List<NetworkProductRow> priorAll = queryRepository.cciProductMetricsInRange(retailerIds, window.priorStart(), window.priorEnd());
        NetworkProductRow recent = recentAll.stream().filter(row -> row.product().equals(productName)).findFirst().orElse(null);
        NetworkProductRow prior = priorAll.stream().filter(row -> row.product().equals(productName)).findFirst().orElse(null);

        long recentBaskets = recent == null ? 0 : recent.basketCount();
        long priorBaskets = prior == null ? 0 : prior.basketCount();
        BigDecimal recentRevenue = recent == null ? BigDecimal.ZERO : recent.revenue();
        BigDecimal priorRevenue = prior == null ? BigDecimal.ZERO : prior.revenue();
        double changePct = priorBaskets == 0 ? 0.0 : 100.0 * (recentBaskets - priorBaskets) / (double) priorBaskets;
        String category = recent != null ? recent.category() : prior != null ? prior.category() : "Unmapped";
        String brand = recent != null ? recent.brand() : prior != null ? prior.brand() : "Unbranded";

        List<NetworkProductPresenceRow> recentPresence = queryRepository.productStorePresenceInRange(
            retailerIds, productName, window.recentStart(), window.recentEnd());
        List<NetworkProductPresenceRow> priorPresence = queryRepository.productStorePresenceInRange(
            retailerIds, productName, window.priorStart(), window.priorEnd());
        Map<String, Long> recentByStore = groupDistinctReceipts(recentPresence);
        Map<String, Long> priorByStore = groupDistinctReceipts(priorPresence);
        java.util.Set<String> storeKeys = new java.util.LinkedHashSet<>();
        storeKeys.addAll(recentByStore.keySet());
        storeKeys.addAll(priorByStore.keySet());
        List<ProductStoreDistribution> storeDistribution = storeKeys.stream()
            .map(key -> {
                String[] parts = key.split("/", 2);
                long r = recentByStore.getOrDefault(key, 0L);
                long p = priorByStore.getOrDefault(key, 0L);
                double storeChangePct = p == 0 ? 0.0 : 100.0 * (r - p) / (double) p;
                return new ProductStoreDistribution(parts[0], parts[1], r, p, storeChangePct);
            })
            .sorted(Comparator.comparingLong(ProductStoreDistribution::recentBaskets).reversed())
            .toList();

        List<NamedBasketCount> companionProducts = queryRepository
            .companionProductsForProductInRange(retailerIds, productName, window.recentStart(), window.recentEnd())
            .stream().map(row -> new NamedBasketCount(row.label(), row.basketCount())).toList();
        List<NamedBasketCount> companionCategories = queryRepository
            .companionCategoriesForProductInRange(retailerIds, productName, window.recentStart(), window.recentEnd())
            .stream().map(row -> new NamedBasketCount(row.label(), row.basketCount())).toList();

        Daypart strongestDaypart = strongestDaypart(retailerIds, productName, window);

        return new ProductDetail(
            productName, category, brand, periodDays,
            recentBaskets, priorBaskets, changePct, recentRevenue, priorRevenue,
            storeDistribution, companionProducts, companionCategories,
            strongestDaypart == null ? null : strongestDaypart.name(),
            strongestDaypart == null ? 0.0 : strongestDaypart.sharePct()
        );
    }

    /** Only claims a daypart when there are enough distinct receipts to support it - otherwise
     * returns null rather than naming a daypart off a handful of receipts. */
    private Daypart strongestDaypart(List<UUID> retailerIds, String productName, Window window) {
        List<ProductReceiptRow> rows = queryRepository.productReceiptTimestampsInRange(
            retailerIds, productName, window.recentStart(), window.recentEnd());
        if (rows.size() < MIN_SAMPLE_FOR_TREND) return null;
        Map<String, Long> counts = new HashMap<>();
        for (ProductReceiptRow row : rows) {
            ZoneId zone = ZoneId.of(row.zoneId());
            ZonedDateTime local = row.transactionTimestamp().atZone(zone);
            counts.merge(daypart(local), 1L, Long::sum);
        }
        return counts.entrySet().stream()
            .max(Map.Entry.comparingByValue())
            .map(entry -> new Daypart(entry.getKey(), pct(entry.getValue(), rows.size())))
            .orElse(null);
    }

    // Same hour buckets AnalyticsService already uses for the single-retailer daypart view.
    private static String daypart(ZonedDateTime timestamp) {
        int hour = timestamp.getHour();
        if (hour >= 6 && hour < 11) return "MORNING";
        if (hour >= 11 && hour < 15) return "MIDDAY";
        if (hour >= 15 && hour < 18) return "AFTERNOON";
        if (hour >= 18 && hour < 22) return "EVENING";
        return "NIGHT";
    }

    private record Daypart(String name, double sharePct) {
    }

    /**
     * Up to 3 real, computed items - a decline, a gain, and a data-quality note - never an
     * invented fourth item just to fill space. Each one's numbers trace directly to
     * productMovers/overview; the "why" text (store concentration) is computed the same way
     * ChangeDetectionService computes it for a single-retailer investigation, just network-wide.
     */
    public List<BriefItem> commercialBrief(List<Retailer> retailers, int periodDays) {
        List<ProductMover> movers = productMovers(retailers, periodDays, Integer.MAX_VALUE);
        List<BriefItem> items = new ArrayList<>();

        movers.stream()
            .filter(m -> m.basketChangePct() <= -MEANINGFUL_CHANGE_PCT)
            .max(Comparator.comparingLong(ProductMover::priorBaskets))
            .ifPresent(decline -> items.add(declineBriefItem(retailers, periodDays, decline)));

        movers.stream()
            .filter(m -> m.basketChangePct() >= MEANINGFUL_CHANGE_PCT)
            .max(Comparator.comparingDouble(ProductMover::basketChangePct))
            .ifPresent(gain -> items.add(new BriefItem(
                "OPPORTUNITY",
                gain.productName().toUpperCase(Locale.ROOT) + " GROWTH",
                String.format(Locale.ROOT, "%s basket presence increased %.0f%% compared with the previous %d days (%d baskets vs. %d before).",
                    gain.productName(), gain.basketChangePct(), periodDays, gain.recentBaskets(), gain.priorBaskets()),
                "View pattern", "PRODUCT", gain.productName()
            )));

        NetworkOverview overview = overview(retailers, periodDays);
        if (overview.dataCoveragePct() < HEALTHY_MAPPING_PCT) {
            items.add(new BriefItem(
                "DATA_QUALITY",
                "MAPPING COVERAGE",
                String.format(Locale.ROOT, "Product mapping coverage is %.0f%%, so companion-product and category insights should be interpreted cautiously.", overview.dataCoveragePct()),
                "View stores", "STORES", null
            ));
        }
        return items;
    }

    private BriefItem declineBriefItem(List<Retailer> retailers, int periodDays, ProductMover decline) {
        List<UUID> retailerIds = ids(retailers);
        Window window = resolveWindow(retailerIds, periodDays);
        List<NetworkProductPresenceRow> recentPresence = queryRepository.productStorePresenceInRange(
            retailerIds, decline.productName(), window.recentStart(), window.recentEnd()
        );
        List<NetworkProductPresenceRow> priorPresence = queryRepository.productStorePresenceInRange(
            retailerIds, decline.productName(), window.priorStart(), window.priorEnd()
        );
        Map<String, Long> recentByStore = groupDistinctReceipts(recentPresence);
        Map<String, Long> priorByStore = groupDistinctReceipts(priorPresence);

        java.util.Set<String> storeKeys = new java.util.LinkedHashSet<>();
        storeKeys.addAll(recentByStore.keySet());
        storeKeys.addAll(priorByStore.keySet());
        long affectedStores = storeKeys.stream()
            .filter(key -> recentByStore.getOrDefault(key, 0L) < priorByStore.getOrDefault(key, 0L))
            .count();

        String description;
        long totalDecline = Math.abs(decline.recentBaskets() - decline.priorBaskets());
        if (totalDecline > 0 && !storeKeys.isEmpty()) {
            List<Long> declinesDescending = storeKeys.stream()
                .map(key -> priorByStore.getOrDefault(key, 0L) - recentByStore.getOrDefault(key, 0L))
                .filter(delta -> delta > 0)
                .sorted(Comparator.reverseOrder())
                .toList();
            long topDecline = declinesDescending.stream().limit(STORE_CONCENTRATION_LIMIT).mapToLong(Long::longValue).sum();
            double share = declinesDescending.isEmpty() ? 0 : 100.0 * topDecline / (double) declinesDescending.stream().mapToLong(Long::longValue).sum();
            description = String.format(Locale.ROOT,
                "%s penetration decreased %.0f%% across %d stores. %.0f%% of the decline is concentrated in the %d most-affected stores.",
                decline.productName(), Math.abs(decline.basketChangePct()), affectedStores, share, Math.min(STORE_CONCENTRATION_LIMIT, declinesDescending.size())
            );
        } else {
            description = String.format(Locale.ROOT,
                "%s basket presence decreased %.0f%% across %d stores compared with the previous %d days.",
                decline.productName(), Math.abs(decline.basketChangePct()), affectedStores, periodDays
            );
        }

        return new BriefItem(
            "IMPORTANT",
            decline.productName().toUpperCase(Locale.ROOT) + " DECLINE",
            description,
            "Understand why", "PRODUCT", decline.productName()
        );
    }

    private Window resolveWindow(List<UUID> retailerIds, int periodDays) {
        Instant anchor = queryRepository.latestTransactionTimestamp(retailerIds).orElse(Instant.now());
        Instant recentEnd = anchor.plusSeconds(1);
        Instant recentStart = anchor.minus(periodDays, ChronoUnit.DAYS);
        Instant priorEnd = recentStart;
        Instant priorStart = recentStart.minus(periodDays, ChronoUnit.DAYS);
        return new Window(recentStart, recentEnd, priorStart, priorEnd);
    }

    private static Map<String, long[]> groupStoreCounts(List<NetworkBasketRow> rows) {
        Map<String, long[]> byStore = new HashMap<>();
        for (NetworkBasketRow row : rows) {
            String key = row.retailerCode() + "/" + row.externalStoreId();
            long[] counts = byStore.computeIfAbsent(key, ignored -> new long[2]);
            counts[0]++;
            if (row.containsCci()) counts[1]++;
        }
        return byStore;
    }

    private static Map<String, Long> groupDistinctReceipts(List<NetworkProductPresenceRow> rows) {
        Map<String, java.util.Set<UUID>> byStore = new HashMap<>();
        for (NetworkProductPresenceRow row : rows) {
            String key = row.retailerCode() + "/" + row.externalStoreId();
            byStore.computeIfAbsent(key, ignored -> new java.util.HashSet<>()).add(row.receiptId());
        }
        Map<String, Long> counts = new HashMap<>();
        byStore.forEach((key, receipts) -> counts.put(key, (long) receipts.size()));
        return counts;
    }

    private static List<UUID> ids(List<Retailer> retailers) {
        return retailers.stream().map(Retailer::getId).toList();
    }

    private static double pct(long part, long whole) {
        return whole == 0 ? 0.0 : 100.0 * part / (double) whole;
    }

    private record Window(Instant recentStart, Instant recentEnd, Instant priorStart, Instant priorEnd) {
    }
}
