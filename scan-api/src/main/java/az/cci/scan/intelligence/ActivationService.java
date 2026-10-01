package az.cci.scan.intelligence;

import az.cci.scan.domain.Activation;
import az.cci.scan.domain.ActivationStore;
import az.cci.scan.domain.Retailer;
import az.cci.scan.intelligence.ActivationDtos.ActivationPerformance;
import az.cci.scan.intelligence.ActivationDtos.GroupPerformance;
import az.cci.scan.intelligence.IntelligenceQueryRepository.ProductStorePresenceRow;
import az.cci.scan.intelligence.IntelligenceQueryRepository.RangeBasketRow;
import az.cci.scan.repository.ActivationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Test-vs-control activations: a set of test stores compared against a set of control stores for
 * one product, over a dated window. Every number in {@link ActivationPerformance} is a real,
 * computed basket or revenue total from {@link IntelligenceQueryRepository} - the comparison is a
 * before/during difference-in-differences between two observational groups that were not randomly
 * assigned, and the generated language never claims the activation caused anything. Store
 * selection bias, seasonality, and every other confound stay explicit in {@code limitations}.
 */
@Service
public class ActivationService {

    /** Below this many percentage points of difference-in-differences, call it noise, not a signal. */
    private static final double MEANINGFUL_POINT_CHANGE = 2.0;

    private final ActivationRepository activationRepository;
    private final IntelligenceQueryRepository queryRepository;

    ActivationService(ActivationRepository activationRepository, IntelligenceQueryRepository queryRepository) {
        this.activationRepository = activationRepository;
        this.queryRepository = queryRepository;
    }

    @Transactional
    public Activation create(
        Retailer retailer, String name, String objective, String hypothesis, String productName,
        Activation.PrimaryMetric primaryMetric, LocalDate startDate, LocalDate endDate,
        List<String> testStoreIds, List<String> controlStoreIds, String createdBy
    ) {
        if (endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("End date must not be before the start date");
        }
        Set<String> overlap = new HashSet<>(testStoreIds);
        overlap.retainAll(controlStoreIds);
        if (!overlap.isEmpty()) {
            throw new IllegalArgumentException("A store cannot be both test and control: " + overlap);
        }

        Activation activation = new Activation(
            retailer, name, objective, hypothesis, productName, primaryMetric, startDate, endDate, createdBy
        );
        testStoreIds.forEach(storeId -> activation.addStore(new ActivationStore(activation, storeId, ActivationStore.Group.TEST)));
        controlStoreIds.forEach(storeId -> activation.addStore(new ActivationStore(activation, storeId, ActivationStore.Group.CONTROL)));
        return activationRepository.save(activation);
    }

    public Activation get(Retailer retailer, UUID activationId) {
        return activationRepository.findByIdAndRetailer(activationId, retailer)
            .orElseThrow(() -> new IllegalArgumentException("Unknown activation: " + activationId));
    }

    public List<Activation> list(Retailer retailer) {
        return activationRepository.findAllByRetailerOrderByStartDateDesc(retailer);
    }

    /**
     * Recomputed on every call rather than stored - cheap, and it means a RUNNING activation's
     * numbers are always current as of now, not stale from whenever it was last fetched.
     */
    public ActivationPerformance analyze(Retailer retailer, Activation activation) {
        Instant now = Instant.now();
        Instant start = activation.getStartDate().atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant end = activation.getEndDate().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant duringEnd = now.isBefore(end) ? now : end;
        if (duringEnd.isBefore(start)) {
            duringEnd = start;
        }
        Duration duration = Duration.between(start, end);
        Instant baselineStart = start.minus(duration);

        List<String> testStores = storesIn(activation, ActivationStore.Group.TEST);
        List<String> controlStores = storesIn(activation, ActivationStore.Group.CONTROL);

        GroupPerformance test = computeGroup(retailer, activation.getProductName(), testStores, baselineStart, start, start, duringEnd);
        GroupPerformance control = computeGroup(retailer, activation.getProductName(), controlStores, baselineStart, start, start, duringEnd);

        double testChange = test.duringPenetrationPct() - test.baselinePenetrationPct();
        double controlChange = control.duringPenetrationPct() - control.baselinePenetrationPct();
        double differenceInDifference = testChange - controlChange;

        Activation.Status status = activation.status(now);
        String keyFinding = buildKeyFinding(status, differenceInDifference);
        String limitations = buildLimitations(testStores.size(), controlStores.size());
        String recommendation = status == Activation.Status.COMPLETED ? buildRecommendation(differenceInDifference) : null;

        return new ActivationPerformance(test, control, testChange, controlChange, differenceInDifference, keyFinding, limitations, recommendation);
    }

    private GroupPerformance computeGroup(
        Retailer retailer, String productName, List<String> storeIds,
        Instant baselineStart, Instant baselineEnd, Instant duringStart, Instant duringEnd
    ) {
        Set<String> storeSet = Set.copyOf(storeIds);
        List<RangeBasketRow> baselineBaskets = filterBaskets(queryRepository.basketsInRange(retailer.getId(), baselineStart, baselineEnd), storeSet);
        List<RangeBasketRow> duringBaskets = filterBaskets(queryRepository.basketsInRange(retailer.getId(), duringStart, duringEnd), storeSet);
        List<ProductStorePresenceRow> baselinePresence = filterPresence(
            queryRepository.productStorePresenceInRange(retailer.getId(), productName, baselineStart, baselineEnd), storeSet
        );
        List<ProductStorePresenceRow> duringPresence = filterPresence(
            queryRepository.productStorePresenceInRange(retailer.getId(), productName, duringStart, duringEnd), storeSet
        );

        long baselineTotal = baselineBaskets.size();
        long duringTotal = duringBaskets.size();
        long baselineMatching = baselinePresence.stream().map(ProductStorePresenceRow::receiptId).distinct().count();
        long duringMatching = duringPresence.stream().map(ProductStorePresenceRow::receiptId).distinct().count();
        BigDecimal baselineRevenue = sumRevenue(baselinePresence);
        BigDecimal duringRevenue = sumRevenue(duringPresence);
        long reportingStores = duringBaskets.stream().map(RangeBasketRow::externalStoreId).distinct().count();

        return new GroupPerformance(
            storeIds.size(), (int) reportingStores,
            baselineTotal, baselineMatching, pct(baselineMatching, baselineTotal),
            duringTotal, duringMatching, pct(duringMatching, duringTotal),
            baselineRevenue, duringRevenue
        );
    }

    private static List<String> storesIn(Activation activation, ActivationStore.Group group) {
        return activation.getStores().stream()
            .filter(store -> store.getGroup() == group)
            .map(ActivationStore::getExternalStoreId)
            .toList();
    }

    private static List<RangeBasketRow> filterBaskets(List<RangeBasketRow> rows, Set<String> storeIds) {
        return rows.stream().filter(row -> storeIds.contains(row.externalStoreId())).toList();
    }

    private static List<ProductStorePresenceRow> filterPresence(List<ProductStorePresenceRow> rows, Set<String> storeIds) {
        return rows.stream().filter(row -> storeIds.contains(row.externalStoreId())).toList();
    }

    private static BigDecimal sumRevenue(List<ProductStorePresenceRow> rows) {
        return rows.stream().map(ProductStorePresenceRow::lineTotal).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static double pct(long part, long whole) {
        return whole == 0 ? 0.0 : 100.0 * part / (double) whole;
    }

    private static String buildKeyFinding(Activation.Status status, double differenceInDifference) {
        if (status == Activation.Status.DRAFT) {
            return "This activation has not started yet.";
        }
        boolean testAhead = differenceInDifference > MEANINGFUL_POINT_CHANGE;
        boolean controlAhead = differenceInDifference < -MEANINGFUL_POINT_CHANGE;
        if (status == Activation.Status.RUNNING) {
            if (testAhead) return "Test stores are currently outperforming baseline and control, but the test is still running.";
            if (controlAhead) return "Test stores are currently underperforming control, but the test is still running.";
            return "Test and control stores are moving similarly so far; no separation has emerged yet.";
        }
        if (testAhead) {
            return String.format(Locale.ROOT, "Test stores moved %.1f points more than control stores over the activation window.", differenceInDifference);
        }
        if (controlAhead) {
            return String.format(Locale.ROOT, "Test stores moved %.1f points less than control stores over the activation window.", Math.abs(differenceInDifference));
        }
        return "No meaningful difference between test and control stores was observed.";
    }

    private static String buildLimitations(int testStoreCount, int controlStoreCount) {
        return String.format(Locale.ROOT,
            "Store selection was not randomized, so other factors (seasonality, local events, other activations) "
                + "could explain part of this difference. Sample: %d test store(s) vs. %d control store(s).",
            testStoreCount, controlStoreCount
        );
    }

    private static String buildRecommendation(double differenceInDifference) {
        String base = "This is a single observational comparison, not a randomized controlled test - ";
        if (differenceInDifference > MEANINGFUL_POINT_CHANGE) {
            return base + "treat it as a signal worth a wider rollout test, not proof of impact.";
        }
        if (differenceInDifference < -MEANINGFUL_POINT_CHANGE) {
            return base + "treat it as a signal to review execution before expanding this activation.";
        }
        return base + "the result here does not support expanding or stopping based on this activation alone.";
    }
}
