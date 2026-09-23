package az.cci.scan.importing;

import az.cci.scan.catalog.lookup.ExternalProductMatch;
import az.cci.scan.catalog.lookup.ProductLookupClient;
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
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.StoreRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ImportPersistenceService {

    private static final Logger log = LoggerFactory.getLogger(ImportPersistenceService.class);
    private static final int LOOKUP_BATCH_SIZE = 500;

    private final StoreRepository storeRepository;
    private final RetailerRepository retailerRepository;
    private final ImportJobRepository importJobRepository;
    private final ReceiptRepository receiptRepository;
    private final RetailerProductRepository retailerProductRepository;
    private final CanonicalProductRepository canonicalProductRepository;
    private final ProductLookupClient productLookupClient;

    public ImportPersistenceService(
        StoreRepository storeRepository,
        RetailerRepository retailerRepository,
        ImportJobRepository importJobRepository,
        ReceiptRepository receiptRepository,
        RetailerProductRepository retailerProductRepository,
        CanonicalProductRepository canonicalProductRepository,
        ProductLookupClient productLookupClient
    ) {
        this.storeRepository = storeRepository;
        this.retailerRepository = retailerRepository;
        this.importJobRepository = importJobRepository;
        this.receiptRepository = receiptRepository;
        this.retailerProductRepository = retailerProductRepository;
        this.canonicalProductRepository = canonicalProductRepository;
        this.productLookupClient = productLookupClient;
    }

    @Transactional
    public ImportPersistenceResult persistAndComplete(
        Retailer retailer,
        ImportProfile profile,
        ImportJob job,
        List<ParsedTransactionLine> lines
    ) {
        Retailer lockedRetailer = retailerRepository.findLockedById(retailer.getId())
            .orElseThrow(() -> new IllegalArgumentException("Unknown retailer: " + retailer.getId()));
        Map<ReceiptIdentity, List<ParsedTransactionLine>> baskets = lines.stream()
            .collect(Collectors.groupingBy(
                line -> new ReceiptIdentity(line.storeId(), line.receiptId(), line.transactionTimestamp()),
                LinkedHashMap::new,
                Collectors.toList()
            ));
        Map<String, Store> stores = resolveStores(lockedRetailer, baskets.keySet());
        List<PreparedReceipt> prepared = prepareReceipts(lockedRetailer, stores, baskets);
        Map<ExistingReceiptIdentity, Receipt> existingReceipts = loadExistingReceipts(
            lockedRetailer,
            prepared
        );
        Map<String, RetailerProduct> retailerProducts = loadRetailerProducts(lockedRetailer, lines);
        Map<String, CanonicalProduct> canonicalByBarcode = loadCanonicalProducts(lines);
        // Barcodes this batch already asked the external lookup about and got nothing back for -
        // avoids repeating the same failed HTTP call once per line that shares the barcode.
        Set<String> externalLookupMisses = new HashSet<>();

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
                lockedRetailer,
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
                    lockedRetailer,
                    source,
                    retailerProducts,
                    canonicalByBarcode,
                    externalLookupMisses
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
        ImportPersistenceResult result = new ImportPersistenceResult(
            importedReceipts,
            importedLines,
            duplicateReceipts,
            unresolvedProducts.size()
        );
        job.markCompleted(
            lines.size(),
            result.importedReceipts(),
            result.importedLines(),
            result.duplicateReceipts(),
            result.unresolvedProducts()
        );
        importJobRepository.saveAndFlush(job);
        return result;
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
        Map<String, CanonicalProduct> canonicalByBarcode,
        Set<String> externalLookupMisses
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
            resolveWithNewlySuppliedBarcode(existing, source, canonicalByBarcode, externalLookupMisses);
            existing.recordCategory(source.category());
            return existing;
        }

        RetailerProduct product = new RetailerProduct(
            retailer,
            source.productKey(),
            source.productCode(),
            source.barcode(),
            source.productName()
        );
        product.recordCategory(source.category());
        if (source.barcode() != null) {
            CanonicalMatch match = resolveCanonical(source.barcode(), canonicalByBarcode, externalLookupMisses);
            if (match != null) {
                product.mapTo(match.canonical(), match.method());
            }
        }
        retailerProductRepository.save(product);
        retailerProducts.put(product.getProductKey(), product);
        return product;
    }

    /**
     * A product first seen without a barcode (or without one the catalog recognized yet) can become
     * resolvable on a later import: the retailer corrects their export, SCAN's catalog gains that
     * barcode, or an external lookup now recognizes it. Reusing the same row means every past and
     * future receipt referencing it benefits immediately, with no re-import - but only ever upgrades
     * an unresolved product; an already-mapped product's canonical link and recorded barcode are
     * never overwritten.
     */
    private void resolveWithNewlySuppliedBarcode(
        RetailerProduct existing,
        ParsedTransactionLine source,
        Map<String, CanonicalProduct> canonicalByBarcode,
        Set<String> externalLookupMisses
    ) {
        if (source.barcode() == null || source.barcode().isBlank()) {
            return;
        }
        existing.recordBarcode(source.barcode());
        if (!existing.isResolved()) {
            CanonicalMatch match = resolveCanonical(source.barcode(), canonicalByBarcode, externalLookupMisses);
            if (match != null) {
                existing.mapTo(match.canonical(), match.method());
            }
        }
        retailerProductRepository.save(existing);
    }

    /**
     * SCAN's own catalog is checked first and always wins. Only a barcode with nothing local yet
     * falls through to the external lookup, which - unlike a local match - also creates the
     * canonical product on the spot so this and every future retailer selling the same barcode
     * resolves automatically from here on, no operator involved.
     */
    private CanonicalMatch resolveCanonical(
        String barcode,
        Map<String, CanonicalProduct> canonicalByBarcode,
        Set<String> externalLookupMisses
    ) {
        CanonicalProduct local = canonicalByBarcode.get(barcode);
        if (local != null) {
            return new CanonicalMatch(local, RetailerProduct.MatchMethod.EXACT_BARCODE);
        }
        if (externalLookupMisses.contains(barcode)) {
            return null;
        }
        Optional<ExternalProductMatch> found = productLookupClient.lookup(barcode);
        if (found.isEmpty()) {
            externalLookupMisses.add(barcode);
            return null;
        }
        ExternalProductMatch match = found.get();
        // normalized_name has its own unique constraint, separate from barcode. Check first rather
        // than insert-and-catch: a caught constraint violation can leave the transaction's
        // persistence context unable to continue for the rest of this (potentially large) import.
        String key = CanonicalProduct.normalizedKey(match.normalizedName());
        if (!canonicalProductRepository.findAllByNormalizedKeyIn(List.of(key)).isEmpty()) {
            log.info("External match for barcode {} collides with an existing catalog name; left unresolved", barcode);
            externalLookupMisses.add(barcode);
            return null;
        }
        CanonicalProduct created = canonicalProductRepository.save(new CanonicalProduct(
            match.normalizedName(),
            barcode,
            match.brand(),
            null,
            match.category(),
            null,
            null,
            null,
            match.cci()
        ));
        canonicalByBarcode.put(barcode, created);
        return new CanonicalMatch(created, RetailerProduct.MatchMethod.EXTERNAL_LOOKUP);
    }

    private record CanonicalMatch(CanonicalProduct canonical, RetailerProduct.MatchMethod method) {
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
                canonicalDecimal(line.quantity()),
                canonicalDecimal(line.unitPrice()),
                canonicalDecimal(line.discountAmount()),
                canonicalDecimal(line.lineTotal())
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

    private String canonicalDecimal(BigDecimal value) {
        return value.setScale(4).toPlainString();
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
