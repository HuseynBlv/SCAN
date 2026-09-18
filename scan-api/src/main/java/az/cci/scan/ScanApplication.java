package az.cci.scan;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ScanApplication {

    public static void main(String[] args) {
        SpringApplication.run(ScanApplication.class, args);
    }
}
