package az.cci.scan.repository;

import az.cci.scan.domain.Receipt;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.Store;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReceiptRepository extends JpaRepository<Receipt, UUID> {
    Optional<Receipt> findByRetailerAndStoreAndExternalReceiptIdAndTransactionTimestamp(
        Retailer retailer,
        Store store,
        String externalReceiptId,
        Instant transactionTimestamp
    );

    @EntityGraph(attributePaths = {"store", "lines", "lines.retailerProduct", "lines.retailerProduct.canonicalProduct"})
    List<Receipt> findDistinctByRetailerOrderByTransactionTimestampAsc(Retailer retailer);
}
