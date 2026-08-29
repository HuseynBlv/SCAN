package az.cci.scan.repository;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.Retailer;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ImportJobRepository extends JpaRepository<ImportJob, UUID> {
    @EntityGraph(attributePaths = {"retailer", "importProfile"})
    Optional<ImportJob> findFirstByRetailerAndFileSha256OrderByAttemptNumberDesc(
        Retailer retailer,
        String fileSha256
    );

    @Override
    @EntityGraph(attributePaths = {"retailer", "importProfile"})
    Optional<ImportJob> findById(UUID id);
}
