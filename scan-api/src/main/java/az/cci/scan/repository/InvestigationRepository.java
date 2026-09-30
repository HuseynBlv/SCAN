package az.cci.scan.repository;

import az.cci.scan.domain.Investigation;
import az.cci.scan.domain.Retailer;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InvestigationRepository extends JpaRepository<Investigation, UUID> {

    @EntityGraph(attributePaths = {"hypotheses", "notes"})
    Optional<Investigation> findByIdAndRetailer(UUID id, Retailer retailer);

    @EntityGraph(attributePaths = {"hypotheses", "notes"})
    List<Investigation> findAllByRetailerOrderByCreatedAtDesc(Retailer retailer);

    @EntityGraph(attributePaths = {"hypotheses", "notes"})
    List<Investigation> findAllByRetailerAndStatusNotOrderByCreatedAtDesc(Retailer retailer, Investigation.Status status);

    @EntityGraph(attributePaths = {"hypotheses", "notes"})
    List<Investigation> findAllByRetailerAndSubjectTypeAndSubjectNameOrderByCreatedAtDesc(
        Retailer retailer, Investigation.SubjectType subjectType, String subjectName
    );
}
