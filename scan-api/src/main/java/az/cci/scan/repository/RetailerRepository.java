package az.cci.scan.repository;

import az.cci.scan.domain.Retailer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.UUID;

public interface RetailerRepository extends JpaRepository<Retailer, UUID> {
    Optional<Retailer> findByCodeIgnoreCase(String code);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Retailer> findLockedById(UUID id);
}
