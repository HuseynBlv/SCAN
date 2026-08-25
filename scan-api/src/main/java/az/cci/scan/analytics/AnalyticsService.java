package az.cci.scan.analytics;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.Receipt;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.TransactionLine;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static az.cci.scan.analytics.AnalyticsDtos.CategoryMetric;
import static az.cci.scan.analytics.AnalyticsDtos.CciSkuMetric;
import static az.cci.scan.analytics.AnalyticsDtos.CompanionMetric;
import static az.cci.scan.analytics.AnalyticsDtos.OverviewResponse;
import static az.cci.scan.analytics.AnalyticsDtos.SegmentMetric;
import static az.cci.scan.analytics.AnalyticsDtos.StoreMetric;

@Service
public class AnalyticsService {

    private final RetailerRepository retailerRepository;
    private final ReceiptRepository receiptRepository;
    private final InsightRules insightRules;

    public AnalyticsService(
        RetailerRepository retailerRepository,
        ReceiptRepository receiptRepository,
        InsightRules insightRules
    ) {
        this.retailerRepository = retailerRepository;
        this.receiptRepository = receiptRepository;
        this.insightRules = insightRules;
    }

    @Transactional(readOnly = true)
    public OverviewResponse overview(String retailerCode, boolean cciUser) {
        Retailer retailer = retailerRepository.findByCodeIgnoreCase(retailerCode)
            .orElseThrow(() -> new IllegalArgumentException("Unknown retailer: " + retailerCode));
        if (cciUser && !retailer.isCciSharingEnabled()) {
            throw new AccessDeniedException("Retailer has not enabled CCI aggregate sharing");
        }

        List<Receipt> receipts = receiptRepository
            .findDistinctByRetailerOrderByTransactionTimestampAsc(retailer);
        OverviewResponse response = calculate(retailer, receipts);
        return response.withInsights(insightRules.generate(response));
    }

    private OverviewResponse calculate(Retailer retailer, List<Receipt> receipts) {
        long totalBaskets = receipts.size();
        long totalLines = receipts.stream().mapToLong(receipt -> receipt.getLines().size()).sum();
        long mappedLines = receipts.stream()
            .flatMap(receipt -> receipt.getLines().stream())
            .filter(line -> line.getRetailerProduct().isResolved())
            .count();
        List<Receipt> cciReceipts = receipts.stream().filter(this::containsCci).toList();
        long cciBaskets = cciReceipts.size();
        BigDecimal totalValue = receipts.stream()
            .map(Receipt::getBasketValue)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Long> companionCounts = new HashMap<>();
        Map<String, Long> categoryCounts = new HashMap<>();
        for (Receipt receipt : cciReceipts) {
            Set<String> productsInBasket = new HashSet<>();
            Set<String> categoriesInBasket = new HashSet<>();
            for (TransactionLine line : receipt.getLines()) {
                CanonicalProduct product = line.getRetailerProduct().getCanonicalProduct();
                if (product == null || product.isCci()) {
                    continue;
                }
                productsInBasket.add(product.getNormalizedName());
                if (product.getCategory() != null && !product.getCategory().isBlank()) {
                    categoriesInBasket.add(product.getCategory());
                }
            }
            productsInBasket.forEach(product -> companionCounts.merge(product, 1L, Long::sum));
            categoriesInBasket.forEach(category -> categoryCounts.merge(category, 1L, Long::sum));
        }

        List<CompanionMetric> companions = companionCounts.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
            .limit(10)
            .map(entry -> new CompanionMetric(
                entry.getKey(),
                entry.getValue(),
                percentage(entry.getValue(), cciBaskets)
            ))
            .toList();
        List<CategoryMetric> categories = categoryCounts.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
            .limit(10)
            .map(entry -> new CategoryMetric(
                entry.getKey(),
                entry.getValue(),
                percentage(entry.getValue(), cciBaskets)
            ))
            .toList();

        ZoneId zoneId = ZoneId.of(retailer.getZoneId());
        List<SegmentMetric> dayparts = segmentMetrics(receipts, receipt -> daypart(
            receipt.getTransactionTimestamp().atZone(zoneId)
        ));
        List<SegmentMetric> weekdayWeekend = segmentMetrics(receipts, receipt -> {
            DayOfWeek day = receipt.getTransactionTimestamp().atZone(zoneId).getDayOfWeek();
            return day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY
                ? "WEEKEND"
                : "WEEKDAY";
        });

        OverviewResponse response = new OverviewResponse(
            Instant.now(),
            retailer.getCode(),
            retailer.getName(),
            totalBaskets,
            cciBaskets,
            percentage(cciBaskets, totalBaskets),
            average(totalValue, totalBaskets),
            currency(receipts),
            percentage(mappedLines, totalLines),
            companions,
            categories,
            cciSkuMetrics(receipts),
            dayparts,
            weekdayWeekend,
            storeMetrics(receipts),
            List.of()
        );
        return response;
    }

    private boolean containsCci(Receipt receipt) {
        return receipt.getLines().stream().anyMatch(line -> {
            CanonicalProduct product = line.getRetailerProduct().getCanonicalProduct();
            return product != null && product.isCci();
        });
    }

    private List<CciSkuMetric> cciSkuMetrics(List<Receipt> receipts) {
        Map<String, SkuAccumulator> metrics = new HashMap<>();
        for (Receipt receipt : receipts) {
            for (TransactionLine line : receipt.getLines()) {
                CanonicalProduct product = line.getRetailerProduct().getCanonicalProduct();
                if (product == null || !product.isCci()) {
                    continue;
                }
                metrics.computeIfAbsent(product.getNormalizedName(), ignored -> new SkuAccumulator())
                    .add(receipt.getId(), line.getQuantity(), line.getLineTotal());
            }
        }
        return metrics.entrySet().stream()
            .map(entry -> new CciSkuMetric(
                entry.getKey(),
                entry.getValue().receiptIds.size(),
                entry.getValue().quantity,
                entry.getValue().revenue
            ))
            .sorted(Comparator.comparing(CciSkuMetric::basketCount).reversed()
                .thenComparing(CciSkuMetric::product))
            .toList();
    }

    private List<StoreMetric> storeMetrics(List<Receipt> receipts) {
        Map<String, List<Receipt>> byStore = new LinkedHashMap<>();
        receipts.forEach(receipt -> byStore
            .computeIfAbsent(receipt.getStore().getExternalStoreId(), ignored -> new ArrayList<>())
            .add(receipt));
        return byStore.entrySet().stream().map(entry -> {
            List<Receipt> storeReceipts = entry.getValue();
            long cci = storeReceipts.stream().filter(this::containsCci).count();
            BigDecimal value = storeReceipts.stream()
                .map(Receipt::getBasketValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            return new StoreMetric(
                entry.getKey(),
                storeReceipts.size(),
                cci,
                percentage(cci, storeReceipts.size()),
                average(value, storeReceipts.size())
            );
        }).sorted(Comparator.comparing(StoreMetric::basketCount).reversed()
            .thenComparing(StoreMetric::storeId)).toList();
    }

    private List<SegmentMetric> segmentMetrics(
        List<Receipt> receipts,
        java.util.function.Function<Receipt, String> classifier
    ) {
        Map<String, Long> counts = new LinkedHashMap<>();
        receipts.forEach(receipt -> counts.merge(classifier.apply(receipt), 1L, Long::sum));
        return counts.entrySet().stream()
            .map(entry -> new SegmentMetric(
                entry.getKey(),
                entry.getValue(),
                percentage(entry.getValue(), receipts.size())
            ))
            .sorted(Comparator.comparing(SegmentMetric::basketCount).reversed()
                .thenComparing(SegmentMetric::segment))
            .toList();
    }

    private String daypart(ZonedDateTime timestamp) {
        int hour = timestamp.getHour();
        if (hour >= 6 && hour < 11) {
            return "MORNING";
        }
        if (hour >= 11 && hour < 15) {
            return "MIDDAY";
        }
        if (hour >= 15 && hour < 18) {
            return "AFTERNOON";
        }
        if (hour >= 18 && hour < 22) {
            return "EVENING";
        }
        return "NIGHT";
    }

    private String currency(List<Receipt> receipts) {
        Set<String> currencies = receipts.stream().map(Receipt::getCurrency).collect(java.util.stream.Collectors.toSet());
        if (currencies.isEmpty()) {
            return "N/A";
        }
        return currencies.size() == 1 ? currencies.iterator().next() : "MULTI";
    }

    private BigDecimal percentage(long numerator, long denominator) {
        if (denominator == 0) {
            return BigDecimal.ZERO.setScale(1);
        }
        return BigDecimal.valueOf(numerator)
            .multiply(BigDecimal.valueOf(100))
            .divide(BigDecimal.valueOf(denominator), 1, RoundingMode.HALF_UP);
    }

    private BigDecimal average(BigDecimal total, long count) {
        if (count == 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        return total.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
    }

    private static final class SkuAccumulator {
        private final Set<UUID> receiptIds = new HashSet<>();
        private BigDecimal quantity = BigDecimal.ZERO;
        private BigDecimal revenue = BigDecimal.ZERO;

        private void add(UUID receiptId, BigDecimal nextQuantity, BigDecimal nextRevenue) {
            receiptIds.add(receiptId);
            quantity = quantity.add(nextQuantity);
            revenue = revenue.add(nextRevenue);
        }
    }
}
