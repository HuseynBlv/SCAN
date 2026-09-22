package az.cci.scan.catalog.lookup;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class CciBrandCatalogTest {

    private final CciBrandCatalog catalog = new CciBrandCatalog();

    @ParameterizedTest
    @ValueSource(strings = {
        "Coca-Cola", "coca-cola", "COCA-COLA ZERO SUGAR", "Coke",
        "Sprite", "Fanta", "Schweppes", "Bonaqua", "Bon Aqua qazsız",
        "Costa Coffee", "Fuze Tea",
    })
    void recognizesKnownCciBrands(String brand) {
        assertThat(catalog.isCciBrand(brand)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Pepsi", "Lay's", "Nestlé", "Azərçay", "", "  "})
    void doesNotClassifyUnrelatedOrEmptyBrandsAsCci(String brand) {
        assertThat(catalog.isCciBrand(brand)).isFalse();
    }

    @Test
    void doesNotFalsePositiveOnAWordThatMerelyContainsColaOrCoke() {
        // Guards the narrow-matching design: substring matches on common words like "cola" would
        // wrongly classify a competitor's product as CCI, which is worse than missing a real one.
        assertThat(catalog.isCciBrand("RC Cola")).isFalse();
        assertThat(catalog.isCciBrand("Cokeville Snacks")).isFalse();
    }

    @Test
    void matchesAnyBrandInAMultiBrandCommaSeparatedList() {
        assertThat(catalog.isCciBrand("Milka, Oreo")).isFalse();
        assertThat(catalog.isCciBrand("Some Local Co, Sprite")).isTrue();
    }

    @Test
    void returnsNullSafeFalseForNull() {
        assertThat(catalog.isCciBrand(null)).isFalse();
    }
}
