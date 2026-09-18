package az.cci.scan.repository;

import az.cci.scan.domain.ScanAccount;
import az.cci.scan.domain.Retailer;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;
import java.util.UUID;

public interface ScanAccountRepository extends JpaRepository<ScanAccount, UUID> {

    @EntityGraph(attributePaths = {
        "retailer",
        "importProfile",
        "importProfile.retailer",
        "retailerAccess"
    })
    Optional<ScanAccount> findByUsernameIgnoreCase(String username);

    boolean existsByRetailer(Retailer retailer);

    @EntityGraph(attributePaths = {"retailer", "importProfile"})
    List<ScanAccount> findAllByRetailerOrderByCreatedAtAsc(Retailer retailer);

    @EntityGraph(attributePaths = {"retailer", "importProfile"})
    Optional<ScanAccount> findByIdAndRetailer(UUID id, Retailer retailer);
}
