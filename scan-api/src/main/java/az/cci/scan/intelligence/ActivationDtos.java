package az.cci.scan.intelligence;

import az.cci.scan.domain.Activation;
import az.cci.scan.domain.ActivationStore;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

final class ActivationDtos {

    private ActivationDtos() {
    }

    record CreateActivationRequest(
        @NotBlank String name,
        @NotBlank String objective,
        @NotBlank String hypothesis,
        @NotBlank String productName,
        @NotBlank String primaryMetric,
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate,
        @NotEmpty List<String> testStoreIds,
        @NotEmpty List<String> controlStoreIds
    ) {
    }

    /** One group's (test or control) real basket and revenue numbers, baseline window vs. the activation window. */
    record GroupPerformance(
        int storeCount,
        int reportingStoreCount,
        long baselineBaskets,
        long baselineMatchingBaskets,
        double baselinePenetrationPct,
        long duringBaskets,
        long duringMatchingBaskets,
        double duringPenetrationPct,
        BigDecimal baselineRevenue,
        BigDecimal duringRevenue
    ) {
    }

    /**
     * Deliberately not "test caused +N%": a difference-in-differences between two observational
     * groups that were not randomly assigned. keyFinding and recommendation are template text that
     * never claims causation - see ActivationService for the exact wording rules.
     */
    record ActivationPerformance(
        GroupPerformance test,
        GroupPerformance control,
        double testPenetrationPointChange,
        double controlPenetrationPointChange,
        double penetrationDifferenceInDifference,
        String keyFinding,
        String limitations,
        String recommendation
    ) {
    }

    record ActivationResponse(
        UUID id,
        String name,
        String objective,
        String hypothesis,
        String productName,
        String primaryMetric,
        LocalDate startDate,
        LocalDate endDate,
        String status,
        String createdBy,
        Instant createdAt,
        List<String> testStoreIds,
        List<String> controlStoreIds,
        ActivationPerformance performance
    ) {
        static ActivationResponse from(Activation activation, ActivationPerformance performance, Instant now) {
            List<String> testStores = activation.getStores().stream()
                .filter(s -> s.getGroup() == ActivationStore.Group.TEST)
                .map(ActivationStore::getExternalStoreId)
                .toList();
            List<String> controlStores = activation.getStores().stream()
                .filter(s -> s.getGroup() == ActivationStore.Group.CONTROL)
                .map(ActivationStore::getExternalStoreId)
                .toList();
            return new ActivationResponse(
                activation.getId(), activation.getName(), activation.getObjective(), activation.getHypothesis(),
                activation.getProductName(), activation.getPrimaryMetric().name(), activation.getStartDate(),
                activation.getEndDate(), activation.status(now).name(), activation.getCreatedBy(),
                activation.getCreatedAt(), testStores, controlStores, performance
            );
        }
    }
}
