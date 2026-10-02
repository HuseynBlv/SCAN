package az.cci.scan.network;

import az.cci.scan.domain.Retailer;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
import az.cci.scan.network.NetworkDtos.BriefItem;
import az.cci.scan.network.NetworkDtos.CategoryMover;
import az.cci.scan.network.NetworkDtos.NetworkOverview;
import az.cci.scan.network.NetworkDtos.StoreRanking;
import az.cci.scan.network.NetworkQueryRepository.NetworkBasketRow;
import az.cci.scan.network.NetworkQueryRepository.NetworkProductPresenceRow;
import az.cci.scan.network.NetworkQueryRepository.NetworkProductRow;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
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

    NetworkAnalyticsService(NetworkQueryRepository queryRepository) {
        this.queryRepository = queryRepository;
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
