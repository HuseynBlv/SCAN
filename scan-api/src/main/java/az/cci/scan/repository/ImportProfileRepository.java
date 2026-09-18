package az.cci.scan.repository;

import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;
import java.util.UUID;

public interface ImportProfileRepository extends JpaRepository<ImportProfile, UUID> {
    Optional<ImportProfile> findByRetailerAndCodeIgnoreCase(Retailer retailer, String code);
    Optional<ImportProfile> findByIdAndRetailer(UUID id, Retailer retailer);
    List<ImportProfile> findAllByRetailerOrderByCreatedAtAsc(Retailer retailer);
}
