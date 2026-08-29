package az.cci.scan.config;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthController {

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        // Liveness only: no credentials, retailer data, or queries that keep Neon awake.
        // Verify database access separately through an authenticated analytics request.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("status", "UP"));
    }
}
