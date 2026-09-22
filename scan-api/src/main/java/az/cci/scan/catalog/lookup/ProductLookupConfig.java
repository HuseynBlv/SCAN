package az.cci.scan.catalog.lookup;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(ProductLookupProperties.class)
public class ProductLookupConfig {
}
