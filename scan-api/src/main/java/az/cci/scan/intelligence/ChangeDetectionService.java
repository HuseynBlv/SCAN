package az.cci.scan.intelligence;

import az.cci.scan.domain.Retailer;
import az.cci.scan.intelligence.ChangeDetectionDtos.NetworkChange;
import az.cci.scan.intelligence.ChangeDetectionDtos.PeriodComparison;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductChange;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
import az.cci.scan.intelligence.ChangeDetectionDtos.StoreContribution;
import az.cci.scan.intelligence.ChangeDetectionDtos.Window;
import az.cci.scan.intelligence.IntelligenceQueryRepository.CciProductRangeRow;
import az.cci.scan.intelligence.IntelligenceQueryRepository.ProductStorePresenceRow;
import az.cci.scan.intelligence.IntelligenceQueryRepository.RangeBasketRow;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The foundation "My Work", "Investigate" and Copilot's comparePeriods/compareProducts tools all
 * depend on: recent-window-vs-prior-window comparisons, computed purely from real basket data.
 * Every hypothesis signal produced here traces to a specific, named computation - there is
 * nothing in this class that "decides" a cause. It only measures.
 *
 * <p>SCAN has no competitor-product data source in its schema, so this service deliberately
 * computes only two signal types: an availability proxy (a store that used to carry the product
 * stops appearing in baskets at all) and a concentration proxy (the decline is explained by a
 * small number of stores rather than spread network-wide). A "competitive substitution" signal is
 * intentionally not implemented - nothing in SCAN's data could support it without inventing a
 * fact about a competitor SCAN never observed.
 */
@Service
public class ChangeDetectionService {

    /** Matches the tiny-sample threshold InsightRules already uses elsewhere in the codebase. */
    private static final long MIN_SAMPLE_FOR_TREND = 5;
    private static final double CONCENTRATION_SHARE_THRESHOLD = 0.6;
    private static final double AVAILABILITY_NEAR_ZERO_PCT = 1.0;
    private static final int STORE_CONTRIBUTIONS_LIMIT = 8;

    private final IntelligenceQueryRepository queryRepository;

    ChangeDetectionService(IntelligenceQueryRepository queryRepository) {
        this.queryRepository = queryRepository;
    }

    /** Overall CCI basket penetration, recent window vs. the prior window of equal length. */
    public NetworkChange networkChange(Retailer retailer, int periodDays) {
        PeriodComparison period = resolveWindows(retailer.getId(), periodDays);
        List<RangeBasketRow> recent = queryRepository.basketsInRange(
            retailer.getId(), period.recent().start(), period.recent().end()
        );
        List<RangeBasketRow> prior = queryRepository.basketsInRange(
            retailer.getId(), period.prior().start(), period.prior().end()
        );
        long recentBaskets = recent.size();
        long recentCci = recent.stream().filter(RangeBasketRow::containsCci).count();
        long priorBaskets = prior.size();
        long priorCci = prior.stream().filter(RangeBasketRow::containsCci).count();
        double recentPct = pct(recentCci, recentBaskets);
        double priorPct = pct(priorCci, priorBaskets);
        return new NetworkChange(period, recentBaskets, recentCci, priorBaskets, priorCci, recentPct, priorPct, recentPct - priorPct);
    }

    /**
     * CCI products whose basket count fell the most between the two windows, worst first. Only
     * considers products with a real prior baseline ({@code MIN_SAMPLE_FOR_TREND}) - a product
     * with 2 baskets last period going to 0 is not a reliable "decline", it's noise.
     */
    public List<ProductMover> biggestDecliners(Retailer retailer, int periodDays, int limit) {
        PeriodComparison period = resolveWindows(retailer.getId(), periodDays);
        List<CciProductRangeRow> recent = queryRepository.cciProductMetricsInRange(
            retailer.getId(), period.recent().start(), period.recent().end()
        );
        List<CciProductRangeRow> prior = queryRepository.cciProductMetricsInRange(
            retailer.getId(), period.prior().start(), period.prior().end()
        );
        Map<String, CciProductRangeRow> recentByName = recent.stream()
            .collect(Collectors.toMap(CciProductRangeRow::product, r -> r, (a, b) -> a));

        List<ProductMover> movers = new ArrayList<>();
        for (CciProductRangeRow p : prior) {
            if (p.basketCount() < MIN_SAMPLE_FOR_TREND) {
                continue;
            }
            CciProductRangeRow r = recentByName.get(p.product());
            long recentBaskets = r == null ? 0 : r.basketCount();
            BigDecimal recentRevenue = r == null ? BigDecimal.ZERO : r.revenue();
            double changePct = 100.0 * (recentBaskets - p.basketCount()) / (double) p.basketCount();
            movers.add(new ProductMover(p.product(), p.category(), recentBaskets, p.basketCount(), recentRevenue, p.revenue(), changePct));
        }
        movers.sort(Comparator.comparingDouble(ProductMover::basketChangePct));
        return movers.stream().limit(limit).toList();
    }

    /**
     * A single product's change, broken down by store, with the two honest signals this codebase
     * is willing to compute attached when the numbers actually support them.
     */
    public ProductChange compareProduct(Retailer retailer, String productName, int periodDays) {
        PeriodComparison period = resolveWindows(retailer.getId(), periodDays);

        List<ProductStorePresenceRow> recentPresence = queryRepository.productStorePresenceInRange(
            retailer.getId(), productName, period.recent().start(), period.recent().end()
        );
        List<ProductStorePresenceRow> priorPresence = queryRepository.productStorePresenceInRange(
            retailer.getId(), productName, period.prior().start(), period.prior().end()
        );
        List<RangeBasketRow> recentBaskets = queryRepository.basketsInRange(
            retailer.getId(), period.recent().start(), period.recent().end()
        );
        List<RangeBasketRow> priorBaskets = queryRepository.basketsInRange(
            retailer.getId(), period.prior().start(), period.prior().end()
        );
        List<CciProductRangeRow> recentProductMetrics = queryRepository.cciProductMetricsInRange(
            retailer.getId(), period.recent().start(), period.recent().end()
        );
        List<CciProductRangeRow> priorProductMetrics = queryRepository.cciProductMetricsInRange(
            retailer.getId(), period.prior().start(), period.prior().end()
        );

        Map<String, Set<UUID>> recentReceiptsByStore = receiptsByStore(recentPresence);
        Map<String, Set<UUID>> priorReceiptsByStore = receiptsByStore(priorPresence);
        Map<String, Long> recentStoreTotals = storeBasketTotals(recentBaskets);
        Map<String, Long> priorStoreTotals = storeBasketTotals(priorBaskets);

        Set<String> storeIds = new HashSet<>();
        storeIds.addAll(recentReceiptsByStore.keySet());
        storeIds.addAll(priorReceiptsByStore.keySet());
        storeIds.addAll(recentStoreTotals.keySet());
        storeIds.addAll(priorStoreTotals.keySet());

        double networkPriorPenetration = pct(
            priorPresence.stream().map(ProductStorePresenceRow::receiptId).distinct().count(),
            priorBaskets.size()
        );

        List<StoreContribution> contributions = new ArrayList<>();
        for (String storeId : storeIds) {
            long recentProductBaskets = recentReceiptsByStore.getOrDefault(storeId, Set.of()).size();
            long priorProductBaskets = priorReceiptsByStore.getOrDefault(storeId, Set.of()).size();
            long recentStoreBaskets = recentStoreTotals.getOrDefault(storeId, 0L);
            long priorStoreBaskets = priorStoreTotals.getOrDefault(storeId, 0L);
            double recentPenetration = pct(recentProductBaskets, recentStoreBaskets);
            double priorPenetration = pct(priorProductBaskets, priorStoreBaskets);
            contributions.add(new StoreContribution(
                storeId,
                recentProductBaskets,
                priorProductBaskets,
                recentStoreBaskets,
                priorStoreBaskets,
                recentPenetration,
                priorPenetration,
                recentProductBaskets - priorProductBaskets
            ));
        }
        contributions.sort(Comparator.comparingLong(StoreContribution::basketDelta));

        long recentTotal = recentPresence.stream().map(ProductStorePresenceRow::receiptId).distinct().count();
        long priorTotal = priorPresence.stream().map(ProductStorePresenceRow::receiptId).distinct().count();
        double basketChangePct = priorTotal == 0
            ? (recentTotal == 0 ? 0.0 : 100.0)
            : 100.0 * (recentTotal - priorTotal) / (double) priorTotal;

        BigDecimal recentRevenue = findRevenue(recentProductMetrics, productName);
        BigDecimal priorRevenue = findRevenue(priorProductMetrics, productName);

        boolean availabilitySignal = false;
        String availabilityEvidence = null;
        List<String> droppedStores = contributions.stream()
            .filter(c -> c.priorPenetrationPct() >= Math.max(networkPriorPenetration * 0.5, 5.0))
            .filter(c -> c.recentPenetrationPct() <= AVAILABILITY_NEAR_ZERO_PCT)
            .map(StoreContribution::externalStoreId)
            .toList();
        if (!droppedStores.isEmpty() && recentTotal < priorTotal) {
            availabilitySignal = true;
            availabilityEvidence = "%d store(s) that regularly carried this product in baskets now show it in essentially none: %s."
                .formatted(droppedStores.size(), String.join(", ", droppedStores.stream().limit(5).toList()));
        }

        boolean concentrationSignal = false;
        String concentrationEvidence = null;
        long totalDecline = contributions.stream().mapToLong(StoreContribution::basketDelta).filter(d -> d < 0).sum();
        if (totalDecline <= -MIN_SAMPLE_FOR_TREND) {
            List<StoreContribution> decliningStores = contributions.stream()
                .filter(c -> c.basketDelta() < 0)
                .toList();
            long topDecline = decliningStores.stream().limit(3).mapToLong(StoreContribution::basketDelta).sum();
            double declineShare = Math.abs(topDecline) / (double) Math.abs(totalDecline);
            if (declineShare >= CONCENTRATION_SHARE_THRESHOLD) {
                List<String> topStores = decliningStores.stream().limit(3).map(StoreContribution::externalStoreId).toList();
                concentrationSignal = true;
                concentrationEvidence = "%.0f%% of the decline is concentrated in %d store(s): %s."
                    .formatted(declineShare * 100.0, topStores.size(), String.join(", ", topStores));
            }
        }

        List<StoreContribution> limitedContributions = contributions.stream().limit(STORE_CONTRIBUTIONS_LIMIT).toList();

        return new ProductChange(
            productName,
            period,
            recentTotal,
            priorTotal,
            recentRevenue,
            priorRevenue,
            basketChangePct,
            limitedContributions,
            availabilitySignal,
            availabilityEvidence,
            concentrationSignal,
            concentrationEvidence
        );
    }

    private PeriodComparison resolveWindows(UUID retailerId, int periodDays) {
        Instant anchor = queryRepository.latestTransactionTimestamp(retailerId).orElse(Instant.now());
        Instant recentEnd = anchor.plusSeconds(1);
        Instant recentStart = anchor.minus(periodDays, ChronoUnit.DAYS);
        Instant priorEnd = recentStart;
        Instant priorStart = recentStart.minus(periodDays, ChronoUnit.DAYS);
        return new PeriodComparison(new Window(recentStart, recentEnd), new Window(priorStart, priorEnd));
    }

    private static Map<String, Set<UUID>> receiptsByStore(List<ProductStorePresenceRow> rows) {
        Map<String, Set<UUID>> byStore = new HashMap<>();
        for (ProductStorePresenceRow row : rows) {
            byStore.computeIfAbsent(row.externalStoreId(), key -> new HashSet<>()).add(row.receiptId());
        }
        return byStore;
    }

    private static Map<String, Long> storeBasketTotals(List<RangeBasketRow> rows) {
        return rows.stream().collect(Collectors.groupingBy(RangeBasketRow::externalStoreId, Collectors.counting()));
    }

    private static BigDecimal findRevenue(List<CciProductRangeRow> rows, String productName) {
        return rows.stream()
            .filter(r -> r.product().equals(productName))
            .map(CciProductRangeRow::revenue)
            .findFirst()
            .orElse(BigDecimal.ZERO);
    }

    private static double pct(long part, long whole) {
        return whole == 0 ? 0.0 : 100.0 * part / (double) whole;
    }
}
