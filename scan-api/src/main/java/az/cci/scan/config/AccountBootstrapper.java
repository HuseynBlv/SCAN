package az.cci.scan.config;

import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.ScanAccount;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.ScanAccountRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

@Component
public class AccountBootstrapper implements ApplicationRunner {

    private final SecurityProperties security;
    private final PilotAccessProperties pilot;
    private final ScanAccountRepository accountRepository;
    private final RetailerRepository retailerRepository;
    private final ImportProfileRepository importProfileRepository;
    private final PasswordEncoder passwordEncoder;

    public AccountBootstrapper(
        SecurityProperties security,
        PilotAccessProperties pilot,
        ScanAccountRepository accountRepository,
        RetailerRepository retailerRepository,
        ImportProfileRepository importProfileRepository,
        PasswordEncoder passwordEncoder
    ) {
        this.security = security;
        this.pilot = pilot;
        this.accountRepository = accountRepository;
        this.retailerRepository = retailerRepository;
        this.importProfileRepository = importProfileRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments arguments) {
        if (!security.bootstrapEnabled()) {
            return;
        }
        Retailer retailer = retailerRepository.findByCodeIgnoreCase(pilot.retailerCode())
            .orElseThrow(() -> new IllegalStateException(
                "Cannot bind accounts to unknown retailer " + pilot.retailerCode()
            ));
        ImportProfile profile = importProfileRepository.findByRetailerAndCodeIgnoreCase(
            retailer,
            pilot.profileCode()
        ).orElseThrow(() -> new IllegalStateException(
            "Cannot bind accounts to unknown import profile " + pilot.profileCode()
        ));

        provision(
            security.adminUsername(),
            security.adminPassword(),
            ScanAccount.Role.ADMIN,
            retailer,
            profile
        );
        ScanAccount cciAccount = provision(
            security.cciUsername(),
            security.cciPassword(),
            ScanAccount.Role.CCI,
            null,
            null
        );
        if (retailer.isCciSharingEnabled()) {
            cciAccount.grantRetailerAccess(retailer);
        }
        provision(
            security.ingestUsername(),
            security.ingestPassword(),
            ScanAccount.Role.INGEST,
            retailer,
            profile
        );
        provision(
            security.retailerUsername(),
            security.retailerPassword(),
            ScanAccount.Role.RETAILER,
            retailer,
            null
        );
        if (security.onboardingEnabled()) {
            provision(
                security.onboardingUsername(),
                security.onboardingPassword(),
                ScanAccount.Role.ONBOARDING,
                null,
                null
            );
        }
    }

    private ScanAccount provision(
        String username,
        String password,
        ScanAccount.Role role,
        Retailer retailer,
        ImportProfile profile
    ) {
        ScanAccount existing = accountRepository.findByUsernameIgnoreCase(username).orElse(null);
        if (existing == null) {
            return accountRepository.save(new ScanAccount(
                username,
                passwordEncoder.encode(password),
                role,
                retailer,
                profile
            ));
        }
        assertSameScope(existing, role, retailer, profile);
        // Bootstrap secrets create initial accounts only. Runtime credential rotation and
        // revocation are authoritative and must survive an application restart.
        return existing;
    }

    private void assertSameScope(
        ScanAccount account,
        ScanAccount.Role role,
        Retailer retailer,
        ImportProfile profile
    ) {
        if (account.getRole() != role
            || !Objects.equals(id(account.getRetailer()), id(retailer))
            || !Objects.equals(id(account.getImportProfile()), id(profile))) {
            throw new IllegalStateException(
                "Account " + account.getUsername()
                    + " is already bound to a different role or retailer. Configure a unique username."
            );
        }
    }

    private Object id(Retailer retailer) {
        return retailer == null ? null : retailer.getId();
    }

    private Object id(ImportProfile profile) {
        return profile == null ? null : profile.getId();
    }
}
