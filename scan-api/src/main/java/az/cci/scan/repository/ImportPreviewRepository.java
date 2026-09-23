package az.cci.scan.repository;

import az.cci.scan.domain.ImportPreview;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ImportPreviewRepository extends JpaRepository<ImportPreview, UUID> {

    @EntityGraph(attributePaths = {"retailer", "importProfile"})
    Optional<ImportPreview> findByIdAndRetailer(UUID id, Retailer retailer);

    void deleteAllByImportProfile(ImportProfile importProfile);

    List<ImportPreview> findAllByRetailer(Retailer retailer);
}
