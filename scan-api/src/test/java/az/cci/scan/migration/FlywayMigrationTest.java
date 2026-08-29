package az.cci.scan.migration;

import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.RetailerRepository;
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

    @Test
    void migrationsCreateAValidatedSchemaAndUsableDemoConfiguration() {
        var retailer = retailerRepository.findByCodeIgnoreCase("DEMO").orElseThrow();

        assertThat(retailer.isCciSharingEnabled()).isTrue();
        assertThat(importProfileRepository.findByRetailerAndCodeIgnoreCase(retailer, "CANONICAL"))
            .isPresent();
        var kaggle = retailerRepository.findByCodeIgnoreCase("KAGGLE").orElseThrow();
        assertThat(kaggle.getZoneId()).isEqualTo("Asia/Baku");
        assertThat(importProfileRepository.findByRetailerAndCodeIgnoreCase(kaggle, "KAGGLE_2019"))
            .isPresent();
        assertThat(canonicalProductRepository.count()).isEqualTo(4);
        assertThat(canonicalProductRepository.findByBarcode("5449000000996"))
            .hasValueSatisfying(product -> assertThat(product.isCci()).isTrue());
    }
}
