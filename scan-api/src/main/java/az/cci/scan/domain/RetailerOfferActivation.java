package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A retailer's real, persisted acceptance of a SCAN commercial offer. The offer itself is
 * recomputed live from the retailer's own recent sales (see RetailerOfferCatalogService) - this
 * row only exists once a retailer has actually clicked "Activate offer", and it is what makes the
 * benefits shown on the retailer Home screen real money-equivalent history rather than a
 * marketing mockup.
 */
@Entity
@Table(
    name = "retailer_offer_activation",
    uniqueConstraints = @UniqueConstraint(
        name = "retailer_offer_activation_unique",
        columnNames = {"retailer_id", "offer_key"}
    )
)
public class RetailerOfferActivation {

    /** The trade-marketing mechanic behind the offer at the moment it was activated. */
    public enum OfferType {
        VOLUME_DISCOUNT,
        BONUS_PRODUCT,
        WEEKEND_ACTIVATION,
        BASKET_GROWTH
    }

    @Id
    @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "retailer_id", nullable = false)
    private Retailer retailer;

    @Column(name = "offer_key", nullable = false, length = 160)
    private String offerKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "offer_type", nullable = false, length = 32)
    private OfferType offerType;

    @Column(nullable = false, length = 256)
    private String title;

    @Column(name = "product_name", nullable = false, length = 256)
    private String productName;

    @Column(length = 128)
    private String category;

    @Column(name = "benefit_summary", nullable = false, length = 256)
    private String benefitSummary;

    @Column(name = "normal_condition", nullable = false, length = 128)
    private String normalCondition;

    @Column(name = "partner_condition", nullable = false, length = 128)
    private String partnerCondition;

    @Column(name = "estimated_benefit_azn", precision = 10, scale = 2)
    private BigDecimal estimatedBenefitAzn;

    @Column(name = "activated_at", nullable = false)
    private Instant activatedAt = Instant.now();

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected RetailerOfferActivation() {
    }

    public RetailerOfferActivation(
        Retailer retailer,
        String offerKey,
        OfferType offerType,
        String title,
        String productName,
        String category,
        String benefitSummary,
        String normalCondition,
        String partnerCondition,
        BigDecimal estimatedBenefitAzn,
        Instant expiresAt
    ) {
        this.retailer = retailer;
        this.offerKey = offerKey;
        this.offerType = offerType;
        this.title = title;
        this.productName = productName;
        this.category = category;
        this.benefitSummary = benefitSummary;
        this.normalCondition = normalCondition;
        this.partnerCondition = partnerCondition;
        this.estimatedBenefitAzn = estimatedBenefitAzn;
        this.expiresAt = expiresAt;
    }

    public UUID getId() {
        return id;
    }

    public Retailer getRetailer() {
        return retailer;
    }

    public String getOfferKey() {
        return offerKey;
    }

    public OfferType getOfferType() {
        return offerType;
    }

    public String getTitle() {
        return title;
    }

    public String getProductName() {
        return productName;
    }

    public String getCategory() {
        return category;
    }

    public String getBenefitSummary() {
        return benefitSummary;
    }

    public String getNormalCondition() {
        return normalCondition;
    }

    public String getPartnerCondition() {
        return partnerCondition;
    }

    public BigDecimal getEstimatedBenefitAzn() {
        return estimatedBenefitAzn;
    }

    public Instant getActivatedAt() {
        return activatedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public boolean isActive(Instant now) {
        return now.isBefore(expiresAt);
    }
}
