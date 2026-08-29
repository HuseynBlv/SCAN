package az.cci.scan.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableConfigurationProperties(PilotAccessProperties.class)
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(authorize -> authorize
                .requestMatchers(HttpMethod.GET,
                    "/", "/index.html", "/assets/**", "/favicon.svg", "/icons.svg", "/health").permitAll()
                .requestMatchers(HttpMethod.HEAD,
                    "/", "/index.html", "/assets/**", "/favicon.svg", "/icons.svg", "/health").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/imports").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/v1/imports/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/v1/connector/imports").hasRole("INGEST")
                .requestMatchers("/api/v1/retailer/**").hasAnyRole("RETAILER", "ADMIN")
                .requestMatchers("/api/v1/product-mappings/**").hasRole("ADMIN")
                .requestMatchers("/api/v1/analytics/**").hasAnyRole("ADMIN", "CCI")
                .requestMatchers("/error").permitAll()
                .anyRequest().authenticated()
            )
            .httpBasic(Customizer.withDefaults())
            .build();
    }

    @Bean
    UserDetailsService userDetailsService(
        PasswordEncoder passwordEncoder,
        @Value("${scan.security.admin-username}") String adminUsername,
        @Value("${scan.security.admin-password}") String adminPassword,
        @Value("${scan.security.cci-username}") String cciUsername,
        @Value("${scan.security.cci-password}") String cciPassword,
        @Value("${scan.security.ingest-username}") String ingestUsername,
        @Value("${scan.security.ingest-password}") String ingestPassword,
        @Value("${scan.security.retailer-username}") String retailerUsername,
        @Value("${scan.security.retailer-password}") String retailerPassword
    ) {
        return new InMemoryUserDetailsManager(
            User.withUsername(adminUsername)
                .password(passwordEncoder.encode(adminPassword))
                .roles("ADMIN")
                .build(),
            User.withUsername(cciUsername)
                .password(passwordEncoder.encode(cciPassword))
                .roles("CCI")
                .build(),
            User.withUsername(ingestUsername)
                .password(passwordEncoder.encode(ingestPassword))
                .roles("INGEST")
                .build(),
            User.withUsername(retailerUsername)
                .password(passwordEncoder.encode(retailerPassword))
                .roles("RETAILER")
                .build()
        );
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
