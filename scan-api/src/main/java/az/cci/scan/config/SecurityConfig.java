package az.cci.scan.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

@Configuration
@EnableConfigurationProperties({
    PilotAccessProperties.class,
    SecurityProperties.class,
    RuntimeEnvironmentProperties.class
})
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
                .requestMatchers(HttpMethod.POST, "/api/v1/imports/preview").hasRole("ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/v1/imports/profile").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/v1/imports/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/imports/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/v1/connector/imports").hasRole("INGEST")
                .requestMatchers("/api/v1/onboarding/**").hasRole("ONBOARDING")
                .requestMatchers("/api/v1/retailer/**").hasAnyRole("RETAILER", "ADMIN")
                .requestMatchers("/api/v1/product-mappings/**").hasRole("ADMIN")
                .requestMatchers("/api/v1/analytics/**").hasRole("CCI")
                .requestMatchers("/api/v1/investigations/**").hasRole("CCI")
                .requestMatchers("/api/v1/field-tasks/**").hasRole("CCI")
                .requestMatchers("/api/v1/copilot/**").hasRole("CCI")
                .requestMatchers("/api/v1/meeting-briefs/**").hasRole("CCI")
                .requestMatchers("/api/v1/watchlist/**").hasRole("CCI")
                .requestMatchers("/api/v1/activations/**").hasRole("CCI")
                .requestMatchers("/api/v1/network/**").hasRole("CCI")
                .requestMatchers("/error").permitAll()
                .anyRequest().authenticated()
            )
            // Browser clients already provide credentials through SCAN's sign-in form. Returning
            // a Basic challenge here makes browsers open a second, native credential dialog after
            // any rejected request. Keep Basic authentication but return a plain 401 so the app
            // can show its own accessible error state instead.
            .httpBasic(basic -> basic.authenticationEntryPoint(
                new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)
            ))
            .build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
