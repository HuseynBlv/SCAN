package az.cci.scan.importing;

import java.util.List;
import java.util.Map;
import java.util.Set;

public record ParsedTable(Set<String> headers, List<Map<String, String>> rows) {
}
