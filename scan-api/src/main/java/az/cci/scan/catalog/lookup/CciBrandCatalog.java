package az.cci.scan.catalog.lookup;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Decides whether a brand name found by an external lookup belongs to the Coca-Cola System, so
 * that decision is deterministic and code-reviewable rather than left to an external API (which has
 * no concept of "CCI") or to a human clicking a checkbox for every product.
 *
 * The list below is a starting point compiled from public sources (the Coca-Cola İçecek corporate
 * site and general brand knowledge), not a verified export of CCI's actual current Azerbaijan
 * portfolio - nobody outside CCI has that. Someone at CCI or SCAN who knows the real, current
 * brand list for this market should review and correct it before this is trusted for a live pilot.
 *
 * Getting this wrong in one direction is much worse than the other: wrongly marking a competitor's
 * product as CCI corrupts the core penetration metric, while missing a real CCI brand just leaves
 * one more product for manual review. So matching stays deliberately narrow (exact brand tokens,
 * not loose substring matches on words like "cola") to keep false positives rare.
 */
@Component
public class CciBrandCatalog {

    private static final Set<String> KNOWN_BRANDS = Set.of(
        "coca-cola", "coca cola", "coke",
        "sprite",
        "fanta",
        "schweppes",
        "powerade",
        "dasani",
        "bonaqua", "bon aqua",
        "minute maid",
        "cappy",
        "fuze tea", "fuse tea",
        "costa coffee", "costa",
        "burn",
        "kinley",
        "damla",
        "georgia"
    );

    public boolean isCciBrand(String rawBrands) {
        if (rawBrands == null || rawBrands.isBlank()) return false;
        for (String token : rawBrands.split(",")) {
            String normalized = normalize(token);
            if (normalized.isEmpty()) continue;
            for (String brand : KNOWN_BRANDS) {
                if (normalized.equals(brand) || normalized.startsWith(brand + " ")) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Exposed for admins reviewing why a product was auto-classified a certain way. */
    public List<String> knownBrands() {
        return KNOWN_BRANDS.stream().sorted().toList();
    }

    private String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
