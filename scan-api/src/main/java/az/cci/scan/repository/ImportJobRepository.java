package az.cci.scan.repository;

import az.cci.scan.domain.ImportJob;
import az.cci.scan.domain.Retailer;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.domain.Pageable;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ImportJobRepository extends JpaRepository<ImportJob, UUID> {
    @EntityGraph(attributePaths = {"retailer", "importProfile"})
    Optional<ImportJob> findFirstByRetailerAndFileSha256OrderByAttemptNumberDesc(
        Retailer retailer,
        String fileSha256
    );

    @EntityGraph(attributePaths = {"retailer", "importProfile"})
    Optional<ImportJob> findFirstByRetailerOrderByCreatedAtDesc(Retailer retailer);

    @EntityGraph(attributePaths = {"retailer", "importProfile"})
    Optional<ImportJob> findByIdAndRetailer(UUID id, Retailer retailer);

    @Override
    @EntityGraph(attributePaths = {"retailer", "importProfile"})
    Optional<ImportJob> findById(UUID id);

    @EntityGraph(attributePaths = {"retailer", "importProfile"})
    List<ImportJob> findAllByRetailerOrderByCreatedAtDesc(Retailer retailer, Pageable pageable);

    long countByRetailerAndStatus(Retailer retailer, ImportJob.Status status);

    long countByRetailerAndStatusAndCompletedAtAfter(
        Retailer retailer,
        ImportJob.Status status,
        Instant completedAfter
    );

    Optional<ImportJob> findFirstByRetailerAndStatusOrderByCreatedAtAsc(
        Retailer retailer, ImportJob.Status status
    );

    Optional<ImportJob> findFirstByRetailerAndStatusOrderByCreatedAtDesc(
        Retailer retailer, ImportJob.Status status
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @EntityGraph(attributePaths = {"retailer", "importProfile"})
    Optional<ImportJob> findFirstByStatusOrderByCreatedAtAsc(ImportJob.Status status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<ImportJob> findAllByStatusInAndUpdatedAtBefore(
        Collection<ImportJob.Status> statuses,
        Instant cutoff
    );
}
