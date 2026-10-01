package az.cci.scan.repository;

import az.cci.scan.domain.FieldTask;
import az.cci.scan.domain.Investigation;
import az.cci.scan.domain.Retailer;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FieldTaskRepository extends JpaRepository<FieldTask, UUID> {

    @EntityGraph(attributePaths = "stores")
    Optional<FieldTask> findByIdAndRetailer(UUID id, Retailer retailer);

    @EntityGraph(attributePaths = "stores")
    List<FieldTask> findAllByRetailerOrderByCreatedAtDesc(Retailer retailer);

    @EntityGraph(attributePaths = "stores")
    List<FieldTask> findAllByInvestigationOrderByCreatedAtDesc(Investigation investigation);

    long countByRetailerAndStatus(Retailer retailer, FieldTask.Status status);
}
