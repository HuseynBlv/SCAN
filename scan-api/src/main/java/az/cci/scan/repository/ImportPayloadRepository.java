package az.cci.scan.repository;

import az.cci.scan.domain.ImportPayload;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ImportPayloadRepository extends JpaRepository<ImportPayload, UUID> {
}
