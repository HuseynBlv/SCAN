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
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ImportPersistenceService {

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

        int duplicateReceipts = 0;
        for (PreparedReceipt candidate : prepared) {
            var existing = receiptRepository
                .findByRetailerAndStoreAndExternalReceiptIdAndTransactionTimestamp(
                    retailer,
                    candidate.store(),
                    candidate.identity().receiptId(),
                    candidate.identity().timestamp()
                );
            if (existing.isPresent()) {
                if (!existing.get().getBasketFingerprint().equals(candidate.fingerprint())) {
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
        Set<UUID> unresolvedProducts = new java.util.HashSet<>();
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
                RetailerProduct retailerProduct = resolveProduct(retailer, source);
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
            receiptRepository.save(receipt);
            importedReceipts++;
            importedLines += candidate.lines().size();
        }

        return new ImportPersistenceResult(
            importedReceipts,
            importedLines,
            duplicateReceipts,
            unresolvedProducts.size()
        );
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

    private RetailerProduct resolveProduct(Retailer retailer, ParsedTransactionLine source) {
        return retailerProductRepository.findByRetailerAndProductKey(retailer, source.productKey())
            .orElseGet(() -> {
                RetailerProduct product = new RetailerProduct(
                    retailer,
                    source.productKey(),
                    source.productCode(),
                    source.barcode(),
                    source.productName()
                );
                if (source.barcode() != null) {
                    canonicalProductRepository.findByBarcode(source.barcode())
                        .ifPresent(canonical -> product.mapTo(
                            canonical,
                            RetailerProduct.MatchMethod.EXACT_BARCODE
                        ));
                }
                return retailerProductRepository.save(product);
            });
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
