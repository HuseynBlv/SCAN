package az.cci.scan.repository;

import az.cci.scan.domain.OperationalAuditEvent;
import az.cci.scan.domain.Retailer;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface OperationalAuditEventRepository extends JpaRepository<OperationalAuditEvent, UUID> {

    @EntityGraph(attributePaths = "retailer")
    List<OperationalAuditEvent> findAllByRetailerOrderByOccurredAtDesc(Retailer retailer, Pageable pageable);
}
