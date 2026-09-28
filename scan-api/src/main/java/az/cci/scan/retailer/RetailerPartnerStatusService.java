package az.cci.scan.retailer;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.RetailerOfferActivation;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.RetailerOfferActivationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static az.cci.scan.retailer.RetailerEngagementDtos.BenefitHistoryEntry;
import static az.cci.scan.retailer.RetailerEngagementDtos.BenefitSummary;
import static az.cci.scan.retailer.RetailerEngagementDtos.PartnerRequirement;
import static az.cci.scan.retailer.RetailerEngagementDtos.PartnerStatusResponse;

/**
 * Computes SCAN Partner standing from a retailer's own real participation, never from how much
 * CCI product it buys: whether the POS connection has ever completed a real sync, how long the
 * retailer has been active, how completely its transaction lines are mapped to the product
 * catalog, and whether syncing is still happening regularly. This deliberately keeps commercial
 * volume out of the status calculation, matching the product decision that Partner status rewards
 * healthy participation in SCAN, not purchase volume.
 */
@Service
public class RetailerPartnerStatusService {

    private static final long DAYS_TO_GOLD = 30;
    private static final long DAYS_TO_PLATINUM = 90;
    private static final BigDecimal RELIABLE_MAPPING_THRESHOLD = BigDecimal.valueOf(90);
    private static final long REGULAR_SYNC_WINDOW_DAYS = 14;

    private final ImportJobRepository importJobRepository;
    private final RetailerAnalyticsQueryRepository queryRepository;
    private final RetailerOfferActivationRepository activationRepository;
    private final Clock clock;

    public RetailerPartnerStatusService(
        ImportJobRepository importJobRepository,
        RetailerAnalyticsQueryRepository queryRepository,
        RetailerOfferActivationRepository activationRepository,
        Clock clock
    ) {
        this.importJobRepository = importJobRepository;
        this.queryRepository = queryRepository;
        this.activationRepository = activationRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PartnerStatusResponse status(Retailer retailer) {
        Instant now = clock.instant();

        boolean connected = importJobRepository.countByRetailerAndStatus(retailer, ImportJob.Status.COMPLETED) > 0;
        long daysActive = Math.max(0, Duration.between(retailer.getCreatedAt(), now).toDays());
        boolean active30 = daysActive >= DAYS_TO_GOLD;
        boolean reliableData = mappedPercentage(retailer).compareTo(RELIABLE_MAPPING_THRESHOLD) >= 0;
        boolean regularSync = importJobRepository.countByRetailerAndStatusAndCompletedAtAfter(
            retailer, ImportJob.Status.COMPLETED, now.minus(REGULAR_SYNC_WINDOW_DAYS, ChronoUnit.DAYS)
        ) > 0;

        List<PartnerRequirement> requirements = List.of(
            new PartnerRequirement("Store connected", connected),
            new PartnerRequirement(DAYS_TO_GOLD + "+ days active", active30),
            new PartnerRequirement("Reliable POS data", reliableData),
            new PartnerRequirement("Regular transaction sync", regularSync)
        );
        long metCount = requirements.stream().filter(PartnerRequirement::met).count();
        boolean meetsGoldBar = metCount == requirements.size();

        String level;
        int progressPercentage;
        String nextLevel;
        Integer daysUntilNextLevel;
        if (meetsGoldBar && daysActive >= DAYS_TO_PLATINUM) {
            level = "PLATINUM";
            progressPercentage = 100;
            nextLevel = null;
            daysUntilNextLevel = null;
        } else if (meetsGoldBar) {
            level = "GOLD";
            progressPercentage = (int) Math.min(99, Math.round(daysActive * 100.0 / DAYS_TO_PLATINUM));
            nextLevel = "PLATINUM";
            daysUntilNextLevel = (int) Math.max(0, DAYS_TO_PLATINUM - daysActive);
        } else {
            level = "SILVER";
            progressPercentage = (int) Math.round(metCount * 100.0 / requirements.size());
            nextLevel = "GOLD";
            // Only promise a day count when days-active is genuinely the sole remaining gap -
            // never imply a date when the connection or data quality itself isn't there yet.
            boolean onlyTenureRemaining = connected && reliableData && regularSync && !active30;
            daysUntilNextLevel = onlyTenureRemaining ? (int) Math.max(0, DAYS_TO_GOLD - daysActive) : null;
        }

        return new PartnerStatusResponse(
            level, progressPercentage, nextLevel, daysUntilNextLevel, requirements,
            (int) daysActive, mappedPercentage(retailer), regularSync, dataCompletenessLabel(retailer),
            benefits(retailer, now), benefitHistory(retailer)
        );
    }

    private String dataCompletenessLabel(Retailer retailer) {
        BigDecimal mapped = mappedPercentage(retailer);
        if (mapped.compareTo(BigDecimal.valueOf(90)) >= 0) return "High";
        if (mapped.compareTo(BigDecimal.valueOf(60)) >= 0) return "Medium";
        return "Low";
    }

    private BigDecimal mappedPercentage(Retailer retailer) {
        RetailerAnalyticsQueryRepository.LineStats stats = queryRepository.lineStats(retailer.getId(), Instant.EPOCH);
        if (stats.totalLines() == 0) return BigDecimal.ZERO;
        return BigDecimal.valueOf(stats.mappedLines())
            .multiply(BigDecimal.valueOf(100))
            .divide(BigDecimal.valueOf(stats.totalLines()), 1, RoundingMode.HALF_UP);
    }

    private BenefitSummary benefits(Retailer retailer, Instant now) {
        ZoneId zoneId = ZoneId.of(retailer.getZoneId());
        YearMonth thisMonth = YearMonth.from(now.atZone(zoneId));
        YearMonth lastMonth = thisMonth.minusMonths(1);
        List<RetailerOfferActivation> activations = activationRepository.findAllByRetailerOrderByActivatedAtDesc(retailer);

        BigDecimal thisMonthTotal = BigDecimal.ZERO;
        BigDecimal lastMonthTotal = BigDecimal.ZERO;
        BigDecimal lifetimeTotal = BigDecimal.ZERO;
        for (RetailerOfferActivation activation : activations) {
            BigDecimal amount = activation.getEstimatedBenefitAzn();
            if (amount == null) continue;
            lifetimeTotal = lifetimeTotal.add(amount);
            YearMonth activationMonth = YearMonth.from(activation.getActivatedAt().atZone(zoneId));
            if (activationMonth.equals(thisMonth)) thisMonthTotal = thisMonthTotal.add(amount);
            else if (activationMonth.equals(lastMonth)) lastMonthTotal = lastMonthTotal.add(amount);
        }
        return new BenefitSummary(
            thisMonthTotal.setScale(2, RoundingMode.HALF_UP),
            lastMonthTotal.setScale(2, RoundingMode.HALF_UP),
            lifetimeTotal.setScale(2, RoundingMode.HALF_UP)
        );
    }

    private List<BenefitHistoryEntry> benefitHistory(Retailer retailer) {
        return activationRepository.findAllByRetailerOrderByActivatedAtDesc(retailer).stream()
            .map(activation -> new BenefitHistoryEntry(
                activation.getActivatedAt(),
                activation.getTitle(),
                activation.getBenefitSummary(),
                activation.getEstimatedBenefitAzn()
            ))
            .toList();
    }
}
