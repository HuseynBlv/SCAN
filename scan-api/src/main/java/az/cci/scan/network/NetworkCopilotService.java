package az.cci.scan.network;

import az.cci.scan.domain.Retailer;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductChange;
import az.cci.scan.intelligence.CopilotDtos.ContextType;
import az.cci.scan.intelligence.CopilotDtos.CopilotAnswer;
import az.cci.scan.intelligence.CopilotService;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * The network-wide "Ask SCAN" path: a product question answered across every retailer the CCI
 * account can see, using the exact same structured-answer template {@link CopilotService} already
 * uses for one retailer ({@link CopilotService#buildProductAnswer}) - only the analytics tool
 * feeding it changes, from {@code ChangeDetectionService.compareProduct} (one retailer) to
 * {@link NetworkAnalyticsService#productChange} (all of them).
 *
 * <p>INVESTIGATION context has no network-wide equivalent - an investigation belongs to one
 * retailer by design, so it is answered by the existing single-retailer
 * {@code /api/v1/copilot/ask} endpoint, not this one. Asking this service about an investigation,
 * or with no product name, gets the same honest fallback the single-retailer Copilot gives rather
 * than a guess. "Prior cases" is also left empty here, not padded with one retailer's history -
 * investigations are not yet searchable across the whole network.
 */
@Service
public class NetworkCopilotService {

    private final NetworkAnalyticsService networkAnalyticsService;

    NetworkCopilotService(NetworkAnalyticsService networkAnalyticsService) {
        this.networkAnalyticsService = networkAnalyticsService;
    }

    public CopilotAnswer answer(List<Retailer> retailers, ContextType contextType, String subjectName, Integer periodDays) {
        if (contextType != ContextType.PRODUCT || subjectName == null || subjectName.isBlank()) {
            return CopilotService.fallback();
        }
        int days = periodDays == null ? 14 : periodDays;
        ProductChange change = networkAnalyticsService.productChange(retailers, subjectName, days);
        return CopilotService.buildProductAnswer(change, subjectName, List.of());
    }
}
