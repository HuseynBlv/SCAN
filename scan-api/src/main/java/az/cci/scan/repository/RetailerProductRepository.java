package az.cci.scan.repository;

import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.RetailerProduct;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RetailerProductRepository extends JpaRepository<RetailerProduct, UUID> {
    @EntityGraph(attributePaths = "canonicalProduct")
    Optional<RetailerProduct> findByRetailerAndProductKey(Retailer retailer, String productKey);

    @EntityGraph(attributePaths = "canonicalProduct")
    List<RetailerProduct> findAllByRetailerAndCanonicalProductIsNullOrderByOriginalProductNameAsc(
        Retailer retailer
    );
}
