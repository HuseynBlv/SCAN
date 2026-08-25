package az.cci.scan.repository;

import az.cci.scan.domain.CanonicalProduct;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CanonicalProductRepository extends JpaRepository<CanonicalProduct, UUID> {
    Optional<CanonicalProduct> findByBarcode(String barcode);

    List<CanonicalProduct> findAllByOrderByNormalizedNameAsc();
}
