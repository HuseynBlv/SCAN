package az.cci.scan.config;

import az.cci.scan.repository.ScanAccountRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountUserDetailsService implements UserDetailsService {

    private final ScanAccountRepository accountRepository;

    public AccountUserDetailsService(ScanAccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return accountRepository.findByUsernameIgnoreCase(username)
            .map(ScanPrincipal::new)
            .orElseThrow(() -> new UsernameNotFoundException("Unknown SCAN account"));
    }
}
