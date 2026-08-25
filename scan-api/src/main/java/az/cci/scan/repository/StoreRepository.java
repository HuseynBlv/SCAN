package az.cci.scan.repository;

import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.Store;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface StoreRepository extends JpaRepository<Store, UUID> {
    Optional<Store> findByRetailerAndExternalStoreId(Retailer retailer, String externalStoreId);
}
