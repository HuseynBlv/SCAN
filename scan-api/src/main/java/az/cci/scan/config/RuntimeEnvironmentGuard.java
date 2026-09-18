package az.cci.scan.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RuntimeEnvironmentGuard implements ApplicationRunner {

    private final JdbcTemplate jdbc;
    private final RuntimeEnvironmentProperties runtime;
    private final Environment environment;

    public RuntimeEnvironmentGuard(
        JdbcTemplate jdbc,
        RuntimeEnvironmentProperties runtime,
        Environment environment
    ) {
        this.jdbc = jdbc;
        this.runtime = runtime;
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) {
        String datasourceUrl = environment.getProperty("spring.datasource.url", "");
        if (runtime.environment().equals("production") && datasourceUrl.startsWith("jdbc:h2:")) {
            throw new IllegalStateException("Production cannot use an in-memory database");
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select environment_name, database_id from scan_runtime_environment where singleton_id = 1"
        );
        if (rows.isEmpty()) {
            jdbc.update(
                "insert into scan_runtime_environment(singleton_id, environment_name, database_id, claimed_at) values (1, ?, ?, current_timestamp)",
                runtime.environment(), runtime.databaseId()
            );
            return;
        }
        Map<String, Object> claim = rows.getFirst();
        String claimedEnvironment = String.valueOf(claim.get("environment_name"));
        String claimedDatabaseId = String.valueOf(claim.get("database_id"));
        if (!claimedEnvironment.equals(runtime.environment()) || !claimedDatabaseId.equals(runtime.databaseId())) {
            throw new IllegalStateException(
                "Database belongs to SCAN environment " + claimedEnvironment
                    + "/" + claimedDatabaseId + ", not "
                    + runtime.environment() + "/" + runtime.databaseId()
            );
        }
    }
}
