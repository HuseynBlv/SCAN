package az.cci.scan.repository;

import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.WatchlistItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WatchlistItemRepository extends JpaRepository<WatchlistItem, UUID> {

    List<WatchlistItem> findAllByRetailerOrderByCreatedAtDesc(Retailer retailer);

    Optional<WatchlistItem> findByRetailerAndProductName(Retailer retailer, String productName);

    Optional<WatchlistItem> findByIdAndRetailer(UUID id, Retailer retailer);
}
