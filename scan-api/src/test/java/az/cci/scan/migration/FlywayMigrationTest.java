package az.cci.scan.migration;

import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.ScanAccountRepository;
import az.cci.scan.domain.ScanAccount;
import az.cci.scan.onboarding.OnboardingService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:scan_migration;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.flyway.enabled=true",
    "spring.jpa.hibernate.ddl-auto=validate"
})
class FlywayMigrationTest {

    @Autowired
    private RetailerRepository retailerRepository;

    @Autowired
    private ImportProfileRepository importProfileRepository;

    @Autowired
    private CanonicalProductRepository canonicalProductRepository;

    @Autowired
    private ScanAccountRepository accountRepository;

    @Autowired
    private OnboardingService onboardingService;

    @Test
    void migrationsCreateAValidatedSchemaAndUsableDemoConfiguration() {
        var retailer = retailerRepository.findByCodeIgnoreCase("DEMO").orElseThrow();

        assertThat(retailer.isCciSharingEnabled()).isTrue();
        assertThat(importProfileRepository.findByRetailerAndCodeIgnoreCase(retailer, "CANONICAL"))
            .hasValueSatisfying(profile -> {
                assertThat(profile.getDisplayName()).isEqualTo("Standard transaction export");
                assertThat(profile.isValidated()).isTrue();
            });
        var kaggle = retailerRepository.findByCodeIgnoreCase("KAGGLE").orElseThrow();
        assertThat(kaggle.getZoneId()).isEqualTo("Asia/Baku");
        assertThat(kaggle.isTransactionImportEnabled()).isFalse();
        assertThat(importProfileRepository.findByRetailerAndCodeIgnoreCase(kaggle, "KAGGLE_2019"))
            .isPresent();
        var casposPilot = retailerRepository.findByCodeIgnoreCase("CASPOS_PILOT").orElseThrow();
        assertThat(casposPilot.getName()).isEqualTo("CASPOS Pilot Retailer");
        assertThat(casposPilot.getZoneId()).isEqualTo("Asia/Baku");
        assertThat(casposPilot.isCciSharingEnabled()).isTrue();
        assertThat(importProfileRepository.findByRetailerAndCodeIgnoreCase(casposPilot, "CLOUDSALE_V1"))
            .hasValueSatisfying(profile -> {
                assertThat(profile.getSourceSystem()).isEqualTo("caspos-cloudsale-provisional-v1");
                assertThat(profile.getCurrency()).isEqualTo("AZN");
                assertThat(profile.getDateTimePattern()).isEqualTo("yyyy-MM-dd'T'HH:mm:ss");
                assertThat(profile.isValidated()).isTrue();
            });
        assertThat(canonicalProductRepository.count()).isEqualTo(4);
        assertThat(canonicalProductRepository.findByBarcode("5449000000996"))
            .hasValueSatisfying(product -> assertThat(product.isCci()).isTrue());
    }

    @Test
    void migratedAccountConstraintAcceptsEveryTenantBoundCredentialRole() {
        var retailer = retailerRepository.findByCodeIgnoreCase("CASPOS_PILOT").orElseThrow();
        var profile = importProfileRepository
            .findByRetailerAndCodeIgnoreCase(retailer, "CLOUDSALE_V1").orElseThrow();

        accountRepository.saveAndFlush(new ScanAccount(
            "migration-owner", "{noop}password", ScanAccount.Role.RETAILER, retailer, null
        ));
        accountRepository.saveAndFlush(new ScanAccount(
            "migration-admin", "{noop}password", ScanAccount.Role.ADMIN, retailer, profile
        ));
        accountRepository.saveAndFlush(new ScanAccount(
            "migration-connector", "{noop}password", ScanAccount.Role.INGEST, retailer, profile
        ));

        assertThat(accountRepository.existsByRetailer(retailer)).isTrue();
    }

    @Test
    void migratedSchemaCanIssueTheCompleteRetailerCredentialSet() {
        var retailer = retailerRepository.findByCodeIgnoreCase("DEMO").orElseThrow();
        var profile = importProfileRepository
            .findByRetailerAndCodeIgnoreCase(retailer, "CANONICAL").orElseThrow();

        var response = onboardingService.issueCredentials(retailer.getId(), profile.getId());

        assertThat(response.credentials()).hasSize(3);
        assertThat(accountRepository.existsByRetailer(retailer)).isTrue();
    }
}
