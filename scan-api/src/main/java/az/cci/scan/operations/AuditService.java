package az.cci.scan.operations;

import az.cci.scan.config.ScanPrincipal;
import az.cci.scan.domain.OperationalAuditEvent;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.ScanAccount;
import az.cci.scan.repository.OperationalAuditEventRepository;
import az.cci.scan.repository.ScanAccountRepository;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {

    private final OperationalAuditEventRepository auditRepository;
    private final ScanAccountRepository accountRepository;

    public AuditService(
        OperationalAuditEventRepository auditRepository,
        ScanAccountRepository accountRepository
    ) {
        this.auditRepository = auditRepository;
        this.accountRepository = accountRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(
        Retailer retailer,
        Authentication authentication,
        String eventType,
        String subjectType,
        String subjectId,
        String detail
    ) {
        ScanAccount account = null;
        if (authentication != null && authentication.getPrincipal() instanceof ScanPrincipal principal) {
            account = accountRepository.findById(principal.accountId()).orElse(null);
        }
        String username = authentication == null ? "system" : authentication.getName();
        auditRepository.save(new OperationalAuditEvent(
            retailer, account, username, eventType, subjectType, subjectId, safeDetail(detail)
        ));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordSystem(
        Retailer retailer,
        String actorUsername,
        String eventType,
        String subjectType,
        String subjectId,
        String detail
    ) {
        auditRepository.save(new OperationalAuditEvent(
            retailer, null, actorUsername, eventType, subjectType, subjectId, safeDetail(detail)
        ));
    }

    private String safeDetail(String detail) {
        if (detail == null) return null;
        return detail.length() <= 2000 ? detail : detail.substring(0, 2000);
    }
}
