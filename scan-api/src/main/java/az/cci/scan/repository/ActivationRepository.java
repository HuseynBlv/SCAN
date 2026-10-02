package az.cci.scan.repository;

import az.cci.scan.domain.Activation;
import az.cci.scan.domain.Retailer;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ActivationRepository extends JpaRepository<Activation, UUID> {

    @EntityGraph(attributePaths = "stores")
    Optional<Activation> findByIdAndRetailer(UUID id, Retailer retailer);

    @EntityGraph(attributePaths = "stores")
    List<Activation> findAllByRetailerOrderByStartDateDesc(Retailer retailer);
}
