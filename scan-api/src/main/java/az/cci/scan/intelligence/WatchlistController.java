package az.cci.scan.intelligence;

import az.cci.scan.config.TenantAccessService;
import az.cci.scan.domain.Retailer;
import az.cci.scan.intelligence.ChangeDetectionDtos.ProductMover;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

import static az.cci.scan.intelligence.WatchlistDtos.FollowProductRequest;
import static az.cci.scan.intelligence.WatchlistDtos.WatchlistItemResponse;

/**
 * Follow a product so its real current comparison always shows up in My Work, regardless of
 * whether it clears the auto-detection threshold the movers feed uses.
 */
@RestController
@RequestMapping("/api/v1/watchlist")
public class WatchlistController {

    private final WatchlistService watchlistService;
    private final TenantAccessService tenantAccess;

    public WatchlistController(WatchlistService watchlistService, TenantAccessService tenantAccess) {
        this.watchlistService = watchlistService;
        this.tenantAccess = tenantAccess;
    }

    @GetMapping
    public List<WatchlistItemResponse> list(@RequestParam String retailerCode, Authentication authentication) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return watchlistService.list(retailer).stream().map(WatchlistItemResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WatchlistItemResponse follow(
        @RequestParam String retailerCode,
        @Valid @RequestBody FollowProductRequest request,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return WatchlistItemResponse.from(watchlistService.follow(retailer, request.productName(), authentication.getName()));
    }

    @DeleteMapping("/{itemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unfollow(
        @PathVariable UUID itemId,
        @RequestParam String retailerCode,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        watchlistService.unfollow(retailer, itemId);
    }

    @GetMapping("/changes")
    public List<ProductMover> changes(
        @RequestParam String retailerCode,
        @RequestParam(defaultValue = "14") int periodDays,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return watchlistService.checkForChanges(retailer, periodDays);
    }
}
