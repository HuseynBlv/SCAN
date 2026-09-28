package az.cci.scan.repository;

import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.RetailerOfferActivation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RetailerOfferActivationRepository extends JpaRepository<RetailerOfferActivation, UUID> {

    Optional<RetailerOfferActivation> findByRetailerAndOfferKey(Retailer retailer, String offerKey);

    List<RetailerOfferActivation> findAllByRetailerOrderByActivatedAtDesc(Retailer retailer);
}
