package az.cci.scan.repository;

import az.cci.scan.domain.Retailer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RetailerRepository extends JpaRepository<Retailer, UUID> {
    Optional<Retailer> findByCodeIgnoreCase(String code);
}
