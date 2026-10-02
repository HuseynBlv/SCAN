package az.cci.scan.intelligence;

import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.WatchlistItem;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductChange;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
import az.cci.scan.repository.WatchlistItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Products a CCI team explicitly asked SCAN to keep watching. Unlike the auto-detected movers
 * feed (which only surfaces a product once its change clears a support/magnitude floor), a
 * watched product's real current comparison is always shown, regardless of size - the team asked
 * for it specifically, so there is no threshold to clear.
 */
@Service
public class WatchlistService {

    private static final int DEFAULT_PERIOD_DAYS = 14;

    private final WatchlistItemRepository watchlistItemRepository;
    private final ChangeDetectionService changeDetectionService;

    WatchlistService(WatchlistItemRepository watchlistItemRepository, ChangeDetectionService changeDetectionService) {
        this.watchlistItemRepository = watchlistItemRepository;
        this.changeDetectionService = changeDetectionService;
    }

    public List<WatchlistItem> list(Retailer retailer) {
        return watchlistItemRepository.findAllByRetailerOrderByCreatedAtDesc(retailer);
    }

    /** Idempotent - following an already-watched product just returns the existing entry. */
    @Transactional
    public WatchlistItem follow(Retailer retailer, String productName, String addedBy) {
        return watchlistItemRepository.findByRetailerAndProductName(retailer, productName)
            .orElseGet(() -> watchlistItemRepository.save(new WatchlistItem(retailer, productName, addedBy)));
    }

    @Transactional
    public void unfollow(Retailer retailer, UUID itemId) {
        WatchlistItem item = watchlistItemRepository.findByIdAndRetailer(itemId, retailer)
            .orElseThrow(() -> new IllegalArgumentException("Unknown watchlist item: " + itemId));
        watchlistItemRepository.delete(item);
    }

    /**
     * The real current recent-vs-prior comparison for every watched product, in the same shape
     * the movers feed uses - every number traces to {@link ChangeDetectionService#compareProduct}.
     */
    public List<ProductMover> checkForChanges(Retailer retailer, int periodDays) {
        return list(retailer).stream()
            .map(item -> toMover(changeDetectionService.compareProduct(retailer, item.getProductName(), periodDays)))
            .toList();
    }

    public List<ProductMover> checkForChanges(Retailer retailer) {
        return checkForChanges(retailer, DEFAULT_PERIOD_DAYS);
    }

    private static ProductMover toMover(ProductChange change) {
        return new ProductMover(
            change.productName(), null, change.recentBaskets(), change.priorBaskets(),
            change.recentRevenue(), change.priorRevenue(), change.basketChangePct()
        );
    }
}
