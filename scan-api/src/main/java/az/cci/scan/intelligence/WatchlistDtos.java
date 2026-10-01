package az.cci.scan.intelligence;

import az.cci.scan.domain.WatchlistItem;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.UUID;

final class WatchlistDtos {

    private WatchlistDtos() {
    }

    record WatchlistItemResponse(UUID id, String productName, String addedBy, Instant createdAt) {
        static WatchlistItemResponse from(WatchlistItem item) {
            return new WatchlistItemResponse(item.getId(), item.getProductName(), item.getAddedBy(), item.getCreatedAt());
        }
    }

    record FollowProductRequest(@NotBlank String productName) {
    }
}
