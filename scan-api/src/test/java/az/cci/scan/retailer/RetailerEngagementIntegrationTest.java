package az.cci.scan.retailer;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.importing.ImportService;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportPreviewRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.OperationalAuditEventRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerOfferActivationRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.ScanAccountRepository;
import az.cci.scan.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static az.cci.scan.retailer.RetailerEngagementDtos.Action;
import static az.cci.scan.retailer.RetailerEngagementDtos.ActionType;
import static az.cci.scan.retailer.RetailerEngagementDtos.Offer;
import static az.cci.scan.retailer.RetailerEngagementDtos.OfferStatus;
import static az.cci.scan.retailer.RetailerEngagementDtos.OffersResponse;
import static az.cci.scan.retailer.RetailerEngagementDtos.PartnerStatusResponse;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class RetailerEngagementIntegrationTest {

    @Autowired
    private ImportService importService;

    @Autowired
    private RetailerOfferCatalogService offerCatalogService;

    @Autowired
    private RetailerActionService actionService;

    @Autowired
    private RetailerPartnerStatusService partnerStatusService;

    @Autowired
    private RetailerRepository retailerRepository;

    @Autowired
    private StoreRepository storeRepository;

    @Autowired
    private ImportProfileRepository importProfileRepository;

    @Autowired
    private ImportJobRepository importJobRepository;

    @Autowired
    private ImportPreviewRepository importPreviewRepository;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private RetailerProductRepository retailerProductRepository;

    @Autowired
    private CanonicalProductRepository canonicalProductRepository;

    @Autowired
    private RetailerOfferActivationRepository activationRepository;

    @Autowired
    private ScanAccountRepository accountRepository;

    @Autowired
    private OperationalAuditEventRepository auditEventRepository;

    private Retailer activeRetailer;
    private Retailer freshRetailer;
    private final Authentication actor = new UsernamePasswordAuthenticationToken("scan-retailer", "n/a", List.of());

    @BeforeEach
    void setUp() throws Exception {
        activationRepository.deleteAll();
        auditEventRepository.deleteAll();
        accountRepository.deleteAll();
        receiptRepository.deleteAll();
        retailerProductRepository.deleteAll();
        importJobRepository.deleteAll();
        importPreviewRepository.deleteAll();
        importProfileRepository.deleteAll();
        storeRepository.deleteAll();
        canonicalProductRepository.deleteAll();
        retailerRepository.deleteAll();

        saveCanonical("Coca-Cola Zero 330ml", "5449000131805", "Beverages", true);
        saveCanonical("Local Bread", "2000000001008", "Bakery", false);

        // Onboarded 45 days ago, so it clears the 30-day-active partner requirement.
        activeRetailer = new Retailer("ARAZ", "Araz Market 24", "Asia/Baku", true);
        setCreatedAt(activeRetailer, Instant.now().minus(45, ChronoUnit.DAYS));
        activeRetailer = retailerRepository.save(activeRetailer);
        importProfileRepository.save(new ImportProfile(
            activeRetailer, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));

        // Recent 14 days: 6 units/day. Prior 14-28 days: 4 units/day. That is a real ~50% growth
        // in recorded quantity, comfortably over the action service's 15% acceleration threshold,
        // so the URGENT action reflects a genuine trend rather than a fabricated one.
        StringBuilder rows = new StringBuilder(
            "store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total\n"
        );
        Instant now = Instant.now();
        for (int day = 0; day < 10; day++) {
            String timestamp = now.minus(day, ChronoUnit.DAYS).toString().substring(0, 19);
            rows.append("STORE-01,R-RECENT-").append(day)
                .append(",").append(timestamp)
                .append(",COKE-ZERO,5449000131805,Coca-Cola Zero 330ml,6,1.20,0.00,7.20\n");
        }
        for (int day = 15; day < 25; day++) {
            String timestamp = now.minus(day, ChronoUnit.DAYS).toString().substring(0, 19);
            rows.append("STORE-01,R-PRIOR-").append(day)
                .append(",").append(timestamp)
                .append(",COKE-ZERO,5449000131805,Coca-Cola Zero 330ml,4,1.20,0.00,4.80\n");
        }
        importService.importFile(activeRetailer.getCode(), "CANONICAL", csv(rows.toString()));

        // A second, freshly onboarded retailer with no sales at all - offers/actions must stay
        // empty for it rather than reusing anything computed for activeRetailer.
        freshRetailer = retailerRepository.save(new Retailer("FRESH", "Fresh Corner Shop", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(
            freshRetailer, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
    }

    @Test
    void computesRealOffersFromARetailersOwnCciSalesAndLeavesAFreshRetailerEmpty() {
        OffersResponse offers = offerCatalogService.offers(activeRetailer);
        assertThat(offers.available()).isNotEmpty();
        assertThat(offers.active()).isEmpty();
        assertThat(offers.completed()).isEmpty();

        Offer offer = offers.available().getFirst();
        assertThat(offer.productName()).isEqualTo("Coca-Cola Zero 330ml");
        assertThat(offer.status()).isEqualTo(OfferStatus.AVAILABLE);
        assertThat(offer.estimatedBenefitAzn()).isGreaterThan(BigDecimal.ZERO);
        assertThat(offer.partnerCondition()).contains("8%");

        OffersResponse freshOffers = offerCatalogService.offers(freshRetailer);
        assertThat(freshOffers.available()).isEmpty();
        assertThat(freshOffers.active()).isEmpty();
        assertThat(freshOffers.completed()).isEmpty();
    }

    @Test
    void activatingAnOfferPersistsItAsARealBenefitAndCannotBeActivatedTwice() {
        Offer candidate = offerCatalogService.offers(activeRetailer).available().getFirst();

        Offer activated = offerCatalogService.activate(activeRetailer, candidate.offerKey(), actor);
        assertThat(activated.status()).isEqualTo(OfferStatus.ACTIVE);

        OffersResponse afterActivation = offerCatalogService.offers(activeRetailer);
        assertThat(afterActivation.active()).hasSize(1);
        assertThat(afterActivation.available()).noneMatch(offer -> offer.offerKey().equals(candidate.offerKey()));

        assertThatThrownBy(() -> offerCatalogService.activate(activeRetailer, candidate.offerKey(), actor))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("already");

        PartnerStatusResponse status = partnerStatusService.status(activeRetailer);
        assertThat(status.benefits().thisMonth()).isEqualByComparingTo(activated.estimatedBenefitAzn());
        assertThat(status.benefitHistory()).hasSize(1);

        assertThat(auditEventRepository.findAll())
            .anyMatch(event -> "RETAILER_OFFER_ACTIVATED".equals(event.getEventType()));
    }

    @Test
    void reportsARealisticActionForAnAcceleratingCciProduct() {
        List<Action> actions = actionService.actions(activeRetailer);
        assertThat(actions).anyMatch(action -> action.type() == ActionType.URGENT
            && action.title().contains("Coca-Cola Zero 330ml"));
        // A fresh retailer with no transactions produces no fabricated actions.
        assertThat(actionService.actions(freshRetailer)).isEmpty();
    }

    @Test
    void partnerStatusRewardsParticipationRatherThanPurchaseVolume() {
        PartnerStatusResponse activeStatus = partnerStatusService.status(activeRetailer);
        assertThat(activeStatus.requirements()).extracting(RetailerEngagementDtos.PartnerRequirement::met)
            .contains(true);
        assertThat(activeStatus.requirements())
            .filteredOn(requirement -> requirement.label().contains("30+"))
            .allMatch(RetailerEngagementDtos.PartnerRequirement::met);

        PartnerStatusResponse freshStatus = partnerStatusService.status(freshRetailer);
        assertThat(freshStatus.level()).isEqualTo("SILVER");
        assertThat(freshStatus.requirements())
            .filteredOn(requirement -> requirement.label().contains("30+"))
            .allMatch(requirement -> !requirement.met());
        assertThat(freshStatus.benefits().thisMonth()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    private void saveCanonical(String name, String barcode, String category, boolean cci) {
        canonicalProductRepository.save(new CanonicalProduct(
            name, barcode, cci ? "CCI" : "Synthetic", cci ? "CCI" : "Synthetic", category, null, null, null, cci
        ));
    }

    private void setCreatedAt(Retailer retailer, Instant createdAt) throws Exception {
        var field = Retailer.class.getDeclaredField("createdAt");
        field.setAccessible(true);
        field.set(retailer, createdAt);
    }

    private MockMultipartFile csv(String contents) {
        return new MockMultipartFile("file", "fixture.csv", "text/csv", contents.getBytes());
    }
}
