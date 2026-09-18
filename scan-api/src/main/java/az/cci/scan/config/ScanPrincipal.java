package az.cci.scan.config;

import az.cci.scan.domain.ScanAccount;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

public final class ScanPrincipal extends User {

    private final UUID accountId;
    private final UUID retailerId;
    private final UUID importProfileId;
    private final Set<UUID> retailerAccessIds;

    public ScanPrincipal(ScanAccount account) {
        super(
            account.getUsername(),
            account.getPasswordHash(),
            account.isEnabled(),
            true,
            true,
            true,
            List.of(new SimpleGrantedAuthority("ROLE_" + account.getRole().name()))
        );
        this.accountId = account.getId();
        this.retailerId = account.getRetailer() == null ? null : account.getRetailer().getId();
        this.importProfileId = account.getImportProfile() == null
            ? null
            : account.getImportProfile().getId();
        this.retailerAccessIds = account.getRetailerAccess().stream()
            .map(az.cci.scan.domain.Retailer::getId)
            .collect(Collectors.toUnmodifiableSet());
    }

    public UUID accountId() {
        return accountId;
    }

    public UUID retailerId() {
        return retailerId;
    }

    public UUID importProfileId() {
        return importProfileId;
    }

    public Set<UUID> retailerAccessIds() {
        return retailerAccessIds;
    }
}
