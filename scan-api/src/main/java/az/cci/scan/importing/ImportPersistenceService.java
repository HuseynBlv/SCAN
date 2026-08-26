package az.cci.scan.importing;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Receipt;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.RetailerProduct;
import az.cci.scan.domain.Store;
import az.cci.scan.domain.TransactionLine;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.StoreRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ImportPersistenceService {

    private static final int LOOKUP_BATCH_SIZE = 500;

    private final StoreRepository storeRepository;
    private final ReceiptRepository receiptRepository;
    private final RetailerProductRepository retailerProductRepository;
    private final CanonicalProductRepository canonicalProductRepository;

    public ImportPersistenceService(
        StoreRepository storeRepository,
        ReceiptRepository receiptRepository,
        RetailerProductRepository retailerProductRepository,
        CanonicalProductRepository canonicalProductRepository
    ) {
        this.storeRepository = storeRepository;
        this.receiptRepository = receiptRepository;
        this.retailerProductRepository = retailerProductRepository;
        this.canonicalProductRepository = canonicalProductRepository;
    }

    @Transactional
    public ImportPersistenceResult persist(
        Retailer retailer,
        ImportProfile profile,
        ImportJob job,
        List<ParsedTransactionLine> lines
    ) {
        Map<ReceiptIdentity, List<ParsedTransactionLine>> baskets = lines.stream()
            .collect(Collectors.groupingBy(
                line -> new ReceiptIdentity(line.storeId(), line.receiptId(), line.transactionTimestamp()),
                LinkedHashMap::new,
                Collectors.toList()
            ));
        Map<String, Store> stores = resolveStores(retailer, baskets.keySet());
        List<PreparedReceipt> prepared = prepareReceipts(retailer, stores, baskets);
        Map<ExistingReceiptIdentity, Receipt> existingReceipts = loadExistingReceipts(retailer, prepared);
        Map<String, RetailerProduct> retailerProducts = loadRetailerProducts(retailer, lines);
        Map<String, CanonicalProduct> canonicalByBarcode = loadCanonicalProducts(lines);

        int duplicateReceipts = 0;
        for (PreparedReceipt candidate : prepared) {
            Receipt existing = existingReceipts.get(new ExistingReceiptIdentity(
                candidate.store().getId(),
                candidate.identity().receiptId(),
                candidate.identity().timestamp()
            ));
            if (existing != null) {
                if (!existing.getBasketFingerprint().equals(candidate.fingerprint())) {
                    throw new ReceiptConflictException(
                        "Receipt " + candidate.identity().receiptId()
                            + " already exists with different line contents"
                    );
                }
                candidate.markDuplicate();
                duplicateReceipts++;
            }
        }

        int importedReceipts = 0;
        int importedLines = 0;
        Set<UUID> unresolvedProducts = new HashSet<>();
        List<Receipt> receiptsToSave = new ArrayList<>();
        for (PreparedReceipt candidate : prepared) {
            if (candidate.duplicate()) {
                continue;
            }

            BigDecimal basketValue = candidate.lines().stream()
                .map(ParsedTransactionLine::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            Receipt receipt = new Receipt(
                retailer,
                candidate.store(),
                candidate.identity().receiptId(),
                candidate.identity().timestamp(),
                profile.getCurrency(),
                basketValue,
                candidate.fingerprint(),
                job
            );

            for (ParsedTransactionLine source : candidate.lines()) {
                RetailerProduct retailerProduct = resolveProduct(
                    retailer,
                    source,
                    retailerProducts,
                    canonicalByBarcode
                );
                if (!retailerProduct.isResolved()) {
                    unresolvedProducts.add(retailerProduct.getId());
                }
                receipt.addLine(new TransactionLine(
                    receipt,
                    retailerProduct,
                    job,
                    source.sourceRowNumber(),
                    source.productCode(),
                    source.barcode(),
                    source.productName(),
                    source.quantity(),
                    source.unitPrice(),
                    source.discountAmount(),
                    source.lineTotal(),
                    profile.getSourceSystem()
                ));
            }
            receiptsToSave.add(receipt);
            importedReceipts++;
            importedLines += candidate.lines().size();
        }
        receiptRepository.saveAll(receiptsToSave);

        return new ImportPersistenceResult(
            importedReceipts,
            importedLines,
            duplicateReceipts,
            unresolvedProducts.size()
        );
    }

    private Map<ExistingReceiptIdentity, Receipt> loadExistingReceipts(
        Retailer retailer,
        List<PreparedReceipt> prepared
    ) {
        Map<ExistingReceiptIdentity, Receipt> receipts = new LinkedHashMap<>();
        Map<Store, List<PreparedReceipt>> byStore = prepared.stream()
            .collect(Collectors.groupingBy(PreparedReceipt::store));
        for (Map.Entry<Store, List<PreparedReceipt>> entry : byStore.entrySet()) {
            List<PreparedReceipt> storeReceipts = entry.getValue();
            List<String> receiptIds = storeReceipts.stream()
                .map(candidate -> candidate.identity().receiptId())
                .distinct()
                .toList();
            Instant from = storeReceipts.stream().map(candidate -> candidate.identity().timestamp())
                .min(Comparator.naturalOrder()).orElseThrow();
            Instant to = storeReceipts.stream().map(candidate -> candidate.identity().timestamp())
                .max(Comparator.naturalOrder()).orElseThrow();
            for (List<String> batch : batches(receiptIds)) {
                receiptRepository
                    .findAllByRetailerAndStoreAndExternalReceiptIdInAndTransactionTimestampBetween(
                        retailer, entry.getKey(), batch, from, to
                    )
                    .forEach(receipt -> receipts.put(
                        new ExistingReceiptIdentity(
                            receipt.getStore().getId(),
                            receipt.getExternalReceiptId(),
                            receipt.getTransactionTimestamp()
                        ),
                        receipt
                    ));
            }
        }
        return receipts;
    }

    private Map<String, RetailerProduct> loadRetailerProducts(
        Retailer retailer,
        List<ParsedTransactionLine> lines
    ) {
        Set<String> keys = new HashSet<>();
        for (ParsedTransactionLine line : lines) {
            keys.add(line.productKey());
            if (line.productCode() != null && !line.productCode().isBlank()) {
                keys.add(ProductIdentity.codeKey(line.productCode()));
            }
        }

        Map<String, RetailerProduct> products = new LinkedHashMap<>();
        for (List<String> batch : batches(keys)) {
            retailerProductRepository.findAllByRetailerAndProductKeyIn(retailer, batch)
                .forEach(product -> products.put(product.getProductKey(), product));
        }
        Set<String> barcodes = lines.stream().map(ParsedTransactionLine::barcode)
            .filter(barcode -> barcode != null && !barcode.isBlank())
            .collect(Collectors.toSet());
        for (List<String> batch : batches(barcodes)) {
            retailerProductRepository.findAllByRetailerAndBarcodeIn(retailer, batch)
                .forEach(product -> products.put(product.getProductKey(), product));
        }
        ProductIdentity.addBarcodeAliases(products);
        return products;
    }

    private Map<String, CanonicalProduct> loadCanonicalProducts(List<ParsedTransactionLine> lines) {
        Set<String> barcodes = lines.stream()
            .map(ParsedTransactionLine::barcode)
            .filter(barcode -> barcode != null && !barcode.isBlank())
            .collect(Collectors.toSet());
        Map<String, CanonicalProduct> products = new HashMap<>();
        for (List<String> batch : batches(barcodes)) {
            canonicalProductRepository.findAllByBarcodeIn(batch)
                .forEach(product -> products.put(product.getBarcode(), product));
        }
        return products;
    }

    private <T> List<List<T>> batches(Collection<T> values) {
        List<T> list = List.copyOf(values);
        List<List<T>> batches = new ArrayList<>();
        for (int start = 0; start < list.size(); start += LOOKUP_BATCH_SIZE) {
            batches.add(list.subList(start, Math.min(start + LOOKUP_BATCH_SIZE, list.size())));
        }
        return batches;
    }

    private Map<String, Store> resolveStores(Retailer retailer, Set<ReceiptIdentity> identities) {
        Map<String, Store> stores = new LinkedHashMap<>();
        identities.stream().map(ReceiptIdentity::storeId).distinct().forEach(externalId -> {
            Store store = storeRepository.findByRetailerAndExternalStoreId(retailer, externalId)
                .orElseGet(() -> storeRepository.save(new Store(retailer, externalId, externalId)));
            stores.put(externalId, store);
        });
        return stores;
    }

    private List<PreparedReceipt> prepareReceipts(
        Retailer retailer,
        Map<String, Store> stores,
        Map<ReceiptIdentity, List<ParsedTransactionLine>> baskets
    ) {
        List<PreparedReceipt> prepared = new ArrayList<>();
        baskets.forEach((identity, basketLines) -> prepared.add(new PreparedReceipt(
            identity,
            stores.get(identity.storeId()),
            List.copyOf(basketLines),
            basketFingerprint(retailer, identity, basketLines)
        )));
        return prepared;
    }

    private RetailerProduct resolveProduct(
        Retailer retailer,
        ParsedTransactionLine source,
        Map<String, RetailerProduct> retailerProducts,
        Map<String, CanonicalProduct> canonicalByBarcode
    ) {
        RetailerProduct existing = retailerProducts.get(source.productKey());
        if (existing == null && source.productCode() != null && !source.productCode().isBlank()) {
            RetailerProduct legacy = retailerProducts.get(ProductIdentity.codeKey(source.productCode()));
            if (legacy != null && (source.barcode() == null || legacy.getBarcode() == null
                || source.barcode().equals(legacy.getBarcode()))) {
                existing = legacy;
            }
        }
        if (existing != null) {
            return existing;
        }

        RetailerProduct product = new RetailerProduct(
            retailer,
            source.productKey(),
            source.productCode(),
            source.barcode(),
            source.productName()
        );
        if (source.barcode() != null) {
            CanonicalProduct canonical = canonicalByBarcode.get(source.barcode());
            if (canonical != null) {
                product.mapTo(canonical, RetailerProduct.MatchMethod.EXACT_BARCODE);
            }
        }
        retailerProductRepository.save(product);
        retailerProducts.put(product.getProductKey(), product);
        return product;
    }

    private String basketFingerprint(
        Retailer retailer,
        ReceiptIdentity identity,
        List<ParsedTransactionLine> lines
    ) {
        List<String> normalizedLines = lines.stream()
            .map(line -> String.join("|",
                nullToEmpty(line.productCode()),
                nullToEmpty(line.barcode()),
                line.productName().trim(),
                line.quantity().toPlainString(),
                line.unitPrice().toPlainString(),
                line.discountAmount().toPlainString(),
                line.lineTotal().toPlainString()
            ))
            .sorted(Comparator.naturalOrder())
            .toList();
        String payload = String.join("|",
            retailer.getCode(),
            identity.storeId(),
            identity.receiptId(),
            identity.timestamp().toString(),
            String.join("\n", normalizedLines)
        );
        return sha256(payload.getBytes(StandardCharsets.UTF_8));
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private record ReceiptIdentity(String storeId, String receiptId, Instant timestamp) {
    }

    private record ExistingReceiptIdentity(UUID storeId, String receiptId, Instant timestamp) {
    }

    private static final class PreparedReceipt {
        private final ReceiptIdentity identity;
        private final Store store;
        private final List<ParsedTransactionLine> lines;
        private final String fingerprint;
        private boolean duplicate;

        private PreparedReceipt(
            ReceiptIdentity identity,
            Store store,
            List<ParsedTransactionLine> lines,
            String fingerprint
        ) {
            this.identity = identity;
            this.store = store;
            this.lines = lines;
            this.fingerprint = fingerprint;
        }

        ReceiptIdentity identity() {
            return identity;
        }

        Store store() {
            return store;
        }

        List<ParsedTransactionLine> lines() {
            return lines;
        }

        String fingerprint() {
            return fingerprint;
        }

        boolean duplicate() {
            return duplicate;
        }

        void markDuplicate() {
            duplicate = true;
        }
    }
}
