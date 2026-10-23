package az.cci.scan.retailer;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Receipt;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.RetailerProduct;
import az.cci.scan.domain.Store;
import az.cci.scan.domain.TransactionLine;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class RetailerOpportunityServiceIntegrationTest {
    @Autowired private RetailerOpportunityService service;
    @Autowired private RetailerOpportunityQueryRepository query;
    @Autowired private RetailerRepository retailers;
    @Autowired private StoreRepository stores;
    @Autowired private ImportProfileRepository profiles;
    @Autowired private ImportJobRepository jobs;
    @Autowired private CanonicalProductRepository products;
    @Autowired private RetailerProductRepository retailerProducts;
    @Autowired private ReceiptRepository receipts;

    @Test
    void persistsTrialBaselineAndKeepsStableOpportunityAcrossRepeatedAnalysis() {
        Retailer retailer = retailers.save(new Retailer("OPP-TEST", "Opportunity test", "Asia/Baku", false));
        Store store = stores.save(new Store(retailer, "STORE-1", "Test store"));
        ImportProfile profile = profiles.save(new ImportProfile(retailer, "OPP", "test", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"));
        ImportJob job = new ImportJob(retailer, profile, "opportunities.csv", "a".repeat(64), 1, "test");
        job.markCompleted(170, 100, 170, 0, 0);
        jobs.save(job);

        RetailerProduct base = product(retailer, "BASE", "Base", "Grocery");
        RetailerProduct cola = product(retailer, "COLA", "Cola", "Beverages");
        RetailerProduct chips = product(retailer, "CHIPS", "Chips", "Snacks");
        Instant timestamp = Instant.now().minusSeconds(86_400);
        for (int i = 0; i < 100; i++) {
            Receipt receipt = new Receipt(retailer, store, "R-" + i, timestamp.plusSeconds(i), "AZN", BigDecimal.TEN, String.format("%064d", i), job);
            line(receipt, base, job, 1);
            if (i < 40) line(receipt, cola, job, 2);
            if (i < 20 || (i >= 40 && i < 50)) line(receipt, chips, job, 3);
            receipts.save(receipt);
        }
        receipts.flush();

        var first = service.opportunities(retailer);
        var pair = first.opportunities().stream().filter(item -> item.subjects().containsAll(java.util.List.of("Cola", "Chips"))).findFirst().orElseThrow();
        var second = service.opportunities(retailer).opportunities().stream().filter(item -> item.id().equals(pair.id())).findFirst();
        assertThat(second).isPresent();

        var activated = service.startTrial(retailer, pair.id(), LocalDate.now(), 7, "retailer-user");
        assertThat(activated.status()).isEqualTo(RetailerOpportunityDtos.Status.ACTIVE);
        assertThat(activated.trial().baselineTo()).isEqualTo(LocalDate.now().minusDays(1));
        assertThat(activated.trial().baselineFrom()).isEqualTo(LocalDate.now().minusDays(7));
        assertThat(activated.trial().baselineValue()).isEqualByComparingTo("20.0");
        assertThat(query.trials(retailer.getId()).getFirst().baselineNumerator()).isEqualTo(20);
        assertThat(query.trials(retailer.getId()).getFirst().baselineDenominator()).isEqualTo(100);
        assertThat(query.trials(retailer.getId())).hasSize(1);

        var reloaded = service.opportunities(retailer).opportunities().stream().filter(item -> item.id().equals(pair.id())).findFirst().orElseThrow();
        assertThat(reloaded.trial().id()).isEqualTo(activated.trial().id());
        assertThat(reloaded.status()).isEqualTo(RetailerOpportunityDtos.Status.ACTIVE);
    }

    @Test
    void preservesTheCategoryDenominatorForBeverageAttachmentTrials() {
        Retailer retailer = retailers.save(new Retailer("ATTACH-TEST", "Attachment test", "Asia/Baku", false));
        Store store = stores.save(new Store(retailer, "STORE-ATTACH", "Attachment store"));
        ImportProfile profile = profiles.save(new ImportProfile(retailer, "ATTACH", "test", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"));
        ImportJob job = new ImportJob(retailer, profile, "attachment.csv", "b".repeat(64), 1, "test");
        job.markCompleted(175, 100, 175, 0, 0);
        jobs.save(job);

        RetailerProduct base = product(retailer, "BASE-ATTACH", "Base item", "Grocery");
        RetailerProduct sandwich = product(retailer, "SANDWICH", "Sandwich", "Sandwiches");
        RetailerProduct cola = product(retailer, "COLA-ATTACH", "Attachment Cola", "Beverages");
        Instant timestamp = Instant.now().minusSeconds(86_400);
        for (int i = 0; i < 100; i++) {
            Receipt receipt = new Receipt(retailer, store, "A-" + i, timestamp.plusSeconds(i), "AZN", BigDecimal.TEN, String.format("%064d", i + 1000), job);
            line(receipt, base, job, 1);
            if (i < 40) line(receipt, sandwich, job, 2);
            if (i < 5 || (i >= 50 && i < 80)) line(receipt, cola, job, 3);
            receipts.save(receipt);
        }
        receipts.flush();

        var attachment = service.opportunities(retailer).opportunities().stream()
            .filter(item -> item.type() == RetailerOpportunityDtos.OpportunityType.BEVERAGE_ATTACHMENT)
            .filter(item -> item.subjects().contains("Sandwiches"))
            .findFirst().orElseThrow();
        var activated = service.startTrial(retailer, attachment.id(), LocalDate.now(), 7, "retailer-user");
        var saved = query.trials(retailer.getId()).getFirst();

        assertThat(activated.trial().baselineValue()).isEqualByComparingTo("12.5");
        assertThat(saved.baselineNumerator()).isEqualTo(5);
        assertThat(saved.baselineDenominator()).isEqualTo(40);
    }

    private RetailerProduct product(Retailer retailer, String key, String name, String category) {
        CanonicalProduct canonical = products.save(new CanonicalProduct(name, null, null, null, category, null, null, null, false));
        RetailerProduct product = new RetailerProduct(retailer, key, key, null, name);
        product.mapTo(canonical, RetailerProduct.MatchMethod.MANUAL);
        return retailerProducts.save(product);
    }

    private static void line(Receipt receipt, RetailerProduct product, ImportJob job, int row) {
        receipt.addLine(new TransactionLine(receipt, product, job, row, product.getSourceProductCode(), null,
            product.getOriginalProductName(), BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ZERO, BigDecimal.ONE, "test"));
    }
}
