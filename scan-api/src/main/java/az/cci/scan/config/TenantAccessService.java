package az.cci.scan.config;

import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.RetailerRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.Comparator;
import java.util.List;

@Service
public class TenantAccessService {

    private final RetailerRepository retailerRepository;
    private final ImportProfileRepository importProfileRepository;

    public TenantAccessService(
        RetailerRepository retailerRepository,
        ImportProfileRepository importProfileRepository
    ) {
        this.retailerRepository = retailerRepository;
        this.importProfileRepository = importProfileRepository;
    }

    @Transactional(readOnly = true)
    public Retailer retailer(Authentication authentication) {
        ScanPrincipal principal = principal(authentication);
        if (principal.retailerId() == null) {
            throw new AccessDeniedException("Account is not bound to a retailer");
        }
        return retailerRepository.findById(principal.retailerId())
            .orElseThrow(() -> new AccessDeniedException("Retailer access is no longer available"));
    }

    @Transactional(readOnly = true)
    public ImportScope importScope(Authentication authentication) {
        ScanPrincipal principal = principal(authentication);
        if (principal.retailerId() == null || principal.importProfileId() == null) {
            throw new AccessDeniedException("Account is not bound to an import profile");
        }
        Retailer retailer = retailerRepository.findById(principal.retailerId())
            .orElseThrow(() -> new AccessDeniedException("Retailer access is no longer available"));
        ImportProfile profile = importProfileRepository.findById(principal.importProfileId())
            .orElseThrow(() -> new AccessDeniedException("Import profile is no longer available"));
        if (!Objects.equals(profile.getRetailer().getId(), retailer.getId())) {
            throw new AccessDeniedException("Import profile does not belong to this retailer");
        }
        return new ImportScope(retailer, profile);
    }

    @Transactional(readOnly = true)
    public Retailer cciRetailer(Authentication authentication, String retailerCode) {
        ScanPrincipal principal = principal(authentication);
        Retailer retailer = retailerRepository.findByCodeIgnoreCase(retailerCode)
            .orElseThrow(() -> new AccessDeniedException("Retailer access is not available"));
        if (!retailer.isCciSharingEnabled()
            || !principal.retailerAccessIds().contains(retailer.getId())) {
            throw new AccessDeniedException("Retailer access is not granted to this account");
        }
        return retailer;
    }

    @Transactional(readOnly = true)
    public List<Retailer> cciRetailers(Authentication authentication) {
        ScanPrincipal principal = principal(authentication);
        return retailerRepository.findAllById(principal.retailerAccessIds()).stream()
            .filter(Retailer::isCciSharingEnabled)
            .sorted(Comparator.comparing(Retailer::getName).thenComparing(Retailer::getCode))
            .toList();
    }

    private ScanPrincipal principal(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof ScanPrincipal principal)) {
            throw new AccessDeniedException("Tenant-bound account required");
        }
        return principal;
    }

    public record ImportScope(Retailer retailer, ImportProfile profile) {
    }
}
