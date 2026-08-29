package az.cci.scan.catalog;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.RetailerProduct;
import az.cci.scan.importing.ProductIdentity;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static az.cci.scan.catalog.ProductMappingDtos.CatalogImportResponse;

@Service
public class ProductCatalogImportService {

    private static final int LOOKUP_BATCH_SIZE = 500;

    private static final Set<String> REQUIRED_HEADERS = Set.of(
        "source_product_name",
        "normalized_name",
        "barcode",
        "brand",
        "manufacturer",
        "category",
        "subcategory",
        "package_size",
        "package_type",
        "is_cci"
    );

    private final RetailerRepository retailerRepository;
    private final RetailerProductRepository retailerProductRepository;
    private final CanonicalProductRepository canonicalProductRepository;

    public ProductCatalogImportService(
        RetailerRepository retailerRepository,
        RetailerProductRepository retailerProductRepository,
        CanonicalProductRepository canonicalProductRepository
    ) {
        this.retailerRepository = retailerRepository;
        this.retailerProductRepository = retailerProductRepository;
        this.canonicalProductRepository = canonicalProductRepository;
    }

    @Transactional
    public CatalogImportResponse importCatalog(String retailerCode, MultipartFile file) {
        Retailer retailer = retailerRepository.findByCodeIgnoreCase(retailerCode)
            .orElseThrow(() -> new IllegalArgumentException("Unknown retailer: " + retailerCode));
        List<CatalogRow> rows = parse(file);

        Map<String, CanonicalProduct> canonicalByName = loadCanonicalByName(rows);
        Map<String, CanonicalProduct> canonicalByBarcode = loadCanonicalByBarcode(rows);
        Map<String, RetailerProduct> retailerProducts = loadRetailerProducts(retailer, rows);

        int createdCanonicalProducts = 0;
        int existingCanonicalProducts = 0;
        int createdRetailerProducts = 0;
        int createdMappings = 0;
        int existingMappings = 0;

        for (CatalogRow row : rows) {
            CanonicalProduct barcodeMatch = row.barcode() == null
                ? null
                : canonicalByBarcode.get(row.barcode());
            CanonicalProduct nameMatch = canonicalByName.get(CanonicalProduct.normalizedKey(
                row.normalizedName()
            ));
            if (barcodeMatch != null && nameMatch != null
                && !barcodeMatch.getId().equals(nameMatch.getId())) {
                throw new IllegalArgumentException(
                    "Catalog product conflicts: barcode and normalized name resolve to different products for "
                        + row.sourceProductName()
                );
            }
            CanonicalProduct canonical = barcodeMatch != null ? barcodeMatch : nameMatch;
            if (canonical == null) {
                canonical = canonicalProductRepository.save(new CanonicalProduct(
                    row.normalizedName(),
                    row.barcode(),
                    row.brand(),
                    row.manufacturer(),
                    row.category(),
                    row.subcategory(),
                    row.packageSize(),
                    row.packageType(),
                    row.cci()
                ));
                canonicalByName.put(canonical.getNormalizedKey(), canonical);
                if (canonical.getBarcode() != null) {
                    canonicalByBarcode.put(canonical.getBarcode(), canonical);
                }
                createdCanonicalProducts++;
            } else {
                validateCanonicalMetadata(canonical, row);
                existingCanonicalProducts++;
            }

            String productKey = ProductIdentity.productKey(
                null,
                row.barcode(),
                row.sourceProductName()
            );
            RetailerProduct retailerProduct = retailerProducts.get(productKey);
            if (retailerProduct == null) {
                retailerProduct = new RetailerProduct(
                    retailer,
                    productKey,
                    null,
                    row.barcode(),
                    row.sourceProductName()
                );
                retailerProducts.put(productKey, retailerProduct);
                createdRetailerProducts++;
            }

            if (retailerProduct.isResolved()) {
                if (!retailerProduct.getCanonicalProduct().getId().equals(canonical.getId())) {
                    throw new IllegalArgumentException(
                        "Catalog mapping conflicts with existing mapping for " + row.sourceProductName()
                    );
                }
                existingMappings++;
            } else {
                retailerProduct.mapTo(canonical, RetailerProduct.MatchMethod.SAVED_MAPPING);
                createdMappings++;
            }
            retailerProductRepository.save(retailerProduct);
        }

        return new CatalogImportResponse(
            rows.size(),
            createdCanonicalProducts,
            existingCanonicalProducts,
            createdRetailerProducts,
            createdMappings,
            existingMappings
        );
    }

    private List<CatalogRow> parse(MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Catalog file is empty");
        }
        CSVFormat format = CSVFormat.RFC4180.builder()
            .setHeader()
            .setSkipHeaderRecord(true)
            .setIgnoreEmptyLines(true)
            .setTrim(true)
            .get();
        try (
            Reader reader = new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8);
            CSVParser parser = format.parse(reader)
        ) {
            List<String> missingHeaders = REQUIRED_HEADERS.stream()
                .filter(header -> !parser.getHeaderNames().contains(header))
                .sorted()
                .toList();
            if (!missingHeaders.isEmpty()) {
                throw new IllegalArgumentException(
                    "Catalog is missing required columns: " + String.join(", ", missingHeaders)
                );
            }

            List<CatalogRow> rows = new ArrayList<>();
            Map<String, Long> sourceNameRows = new LinkedHashMap<>();
            for (CSVRecord record : parser) {
                long sourceRowNumber = record.getRecordNumber() + 1;
                String sourceProductName = required(record, "source_product_name", sourceRowNumber);
                String normalizedName = required(record, "normalized_name", sourceRowNumber);
                String isCci = required(record, "is_cci", sourceRowNumber).toLowerCase(Locale.ROOT);
                if (!isCci.equals("true") && !isCci.equals("false")) {
                    throw new IllegalArgumentException(
                        "Catalog row " + sourceRowNumber + ": is_cci must be true or false"
                    );
                }

                String productKey = ProductIdentity.productKey(null, null, sourceProductName);
                Long existingRow = sourceNameRows.putIfAbsent(productKey, sourceRowNumber);
                if (existingRow != null) {
                    throw new IllegalArgumentException(
                        "Catalog row " + sourceRowNumber
                            + ": source product name duplicates row " + existingRow
                    );
                }

                rows.add(new CatalogRow(
                    sourceProductName,
                    normalizedName,
                    optional(record, "barcode"),
                    optional(record, "brand"),
                    optional(record, "manufacturer"),
                    optional(record, "category"),
                    optional(record, "subcategory"),
                    optional(record, "package_size"),
                    optional(record, "package_type"),
                    Boolean.parseBoolean(isCci)
                ));
            }
            if (rows.isEmpty()) {
                throw new IllegalArgumentException("Catalog contains no product rows");
            }
            return rows;
        } catch (IOException | UncheckedIOException exception) {
            throw new IllegalArgumentException("Unable to read catalog CSV", exception);
        }
    }

    private String required(CSVRecord record, String column, long rowNumber) {
        String value = record.get(column).trim();
        if (value.isBlank()) {
            throw new IllegalArgumentException("Catalog row " + rowNumber + ": " + column + " is required");
        }
        return value;
    }

    private String optional(CSVRecord record, String column) {
        String value = record.get(column).trim();
        return value.isBlank() ? null : value;
    }

    private Map<String, CanonicalProduct> loadCanonicalByName(List<CatalogRow> rows) {
        Set<String> names = new HashSet<>();
        rows.forEach(row -> names.add(CanonicalProduct.normalizedKey(row.normalizedName())));
        Map<String, CanonicalProduct> products = new HashMap<>();
        for (List<String> batch : batches(names)) {
            canonicalProductRepository.findAllByNormalizedKeyIn(batch)
                .forEach(product -> products.put(product.getNormalizedKey(), product));
        }
        return products;
    }

    private Map<String, CanonicalProduct> loadCanonicalByBarcode(List<CatalogRow> rows) {
        Set<String> barcodes = new HashSet<>();
        rows.stream().map(CatalogRow::barcode).filter(Objects::nonNull).forEach(barcodes::add);
        Map<String, CanonicalProduct> products = new HashMap<>();
        for (List<String> batch : batches(barcodes)) {
            canonicalProductRepository.findAllByBarcodeIn(batch)
                .forEach(product -> products.put(product.getBarcode(), product));
        }
        return products;
    }

    private Map<String, RetailerProduct> loadRetailerProducts(
        Retailer retailer,
        List<CatalogRow> rows
    ) {
        Set<String> keys = new HashSet<>();
        rows.forEach(row -> keys.add(ProductIdentity.productKey(
            null,
            row.barcode(),
            row.sourceProductName()
        )));
        Map<String, RetailerProduct> products = new HashMap<>();
        for (List<String> batch : batches(keys)) {
            retailerProductRepository.findAllByRetailerAndProductKeyIn(retailer, batch)
                .forEach(product -> products.put(product.getProductKey(), product));
        }
        Set<String> barcodes = new HashSet<>();
        rows.stream().map(CatalogRow::barcode).filter(Objects::nonNull).forEach(barcodes::add);
        for (List<String> batch : batches(barcodes)) {
            retailerProductRepository.findAllByRetailerAndBarcodeIn(retailer, batch)
                .forEach(product -> products.put(product.getProductKey(), product));
        }
        ProductIdentity.addBarcodeAliases(products);
        return products;
    }

    private void validateCanonicalMetadata(CanonicalProduct canonical, CatalogRow row) {
        Map<String, Boolean> comparisons = new LinkedHashMap<>();
        comparisons.put("normalized_name", Objects.equals(canonical.getNormalizedName(), row.normalizedName()));
        comparisons.put("barcode", Objects.equals(canonical.getBarcode(), row.barcode()));
        comparisons.put("brand", Objects.equals(canonical.getBrand(), row.brand()));
        comparisons.put("manufacturer", Objects.equals(canonical.getManufacturer(), row.manufacturer()));
        comparisons.put("category", Objects.equals(canonical.getCategory(), row.category()));
        comparisons.put("subcategory", Objects.equals(canonical.getSubcategory(), row.subcategory()));
        comparisons.put("package_size", Objects.equals(canonical.getPackageSize(), row.packageSize()));
        comparisons.put("package_type", Objects.equals(canonical.getPackageType(), row.packageType()));
        comparisons.put("is_cci", canonical.isCci() == row.cci());
        List<String> conflictingFields = comparisons.entrySet().stream()
            .filter(entry -> !entry.getValue())
            .map(Map.Entry::getKey)
            .toList();
        if (!conflictingFields.isEmpty()) {
            throw new IllegalArgumentException(
                "Catalog metadata conflicts with existing canonical product "
                    + canonical.getNormalizedName()
                    + " for fields: "
                    + String.join(", ", conflictingFields)
            );
        }
    }

    private <T> List<List<T>> batches(Collection<T> values) {
        List<T> list = List.copyOf(values);
        List<List<T>> batches = new ArrayList<>();
        for (int start = 0; start < list.size(); start += LOOKUP_BATCH_SIZE) {
            batches.add(list.subList(start, Math.min(start + LOOKUP_BATCH_SIZE, list.size())));
        }
        return batches;
    }

    private record CatalogRow(
        String sourceProductName,
        String normalizedName,
        String barcode,
        String brand,
        String manufacturer,
        String category,
        String subcategory,
        String packageSize,
        String packageType,
        boolean cci
    ) {
    }
}
