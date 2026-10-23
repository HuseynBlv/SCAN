package az.cci.scan.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Schema mapping for retailer opportunity trials. The opportunity service uses focused JDBC
 * projections for analysis, while this mapping keeps Hibernate schema validation and test
 * create-drop environments aligned with the Flyway migration.
 */
@Entity
@Table(name = "retailer_opportunity_trial")
public class RetailerOpportunityTrial {
    @Id private UUID id;
    @Column(name = "retailer_id", nullable = false) private UUID retailerId;
    @Column(name = "opportunity_key", nullable = false, length = 96) private String opportunityKey;
    @Column(name = "opportunity_type", nullable = false, length = 48) private String opportunityType;
    @Column(nullable = false, length = 256) private String title;
    @Column(name = "store_id", nullable = false, length = 128) private String storeId;
    @Column(name = "product_a", length = 256) private String productA;
    @Column(name = "product_b", length = 256) private String productB;
    @Column(name = "action_title", nullable = false, length = 128) private String actionTitle;
    @Column(name = "start_date", nullable = false) private LocalDate startDate;
    @Column(name = "end_date", nullable = false) private LocalDate endDate;
    @Column(name = "baseline_start", nullable = false) private LocalDate baselineStart;
    @Column(name = "baseline_end", nullable = false) private LocalDate baselineEnd;
    @Column(name = "baseline_metric", nullable = false, length = 64) private String baselineMetric;
    @Column(name = "baseline_value", nullable = false, precision = 19, scale = 4) private BigDecimal baselineValue;
    @Column(name = "baseline_numerator", nullable = false) private long baselineNumerator;
    @Column(name = "baseline_denominator", nullable = false) private long baselineDenominator;
    @Column(name = "created_by", nullable = false, length = 128) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected RetailerOpportunityTrial() {
    }
}
