package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/**
 * A product a CCI team explicitly asked SCAN to keep watching, shared across the retailer's CCI
 * account the way investigations are - not a personal per-user list. Scoped to products only:
 * see the V16 migration for why a store/category/region watchlist isn't built yet.
 */
@Entity
@Table(
    name = "watchlist_item",
    uniqueConstraints = @UniqueConstraint(name = "watchlist_item_unique", columnNames = {"retailer_id", "product_name"})
)
public class WatchlistItem {

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_id", nullable = false)
    private Retailer retailer;

    @Column(name = "product_name", nullable = false, length = 256)
    private String productName;

    @Column(name = "added_by", nullable = false, length = 128)
    private String addedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected WatchlistItem() {
    }

    public WatchlistItem(Retailer retailer, String productName, String addedBy) {
        this.retailer = retailer;
        this.productName = productName;
        this.addedBy = addedBy;
    }

    public UUID getId() {
        return id;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public String getProductName() {
        return productName;
    }

    public String getAddedBy() {
        return addedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
