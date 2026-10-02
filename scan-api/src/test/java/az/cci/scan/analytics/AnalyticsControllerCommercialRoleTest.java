package az.cci.scan.analytics;

import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.ScanAccount;
import az.cci.scan.repository.ActivationRepository;
import az.cci.scan.repository.FieldTaskRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportPreviewRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.InvestigationRepository;
import az.cci.scan.repository.OperationalAuditEventRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerOfferActivationRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.ScanAccountRepository;
import az.cci.scan.repository.StoreRepository;
import az.cci.scan.repository.WatchlistItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

/**
 * Proves the commercial-role preference is a real, persisted, self-service setting: it defaults
 * to COMMERCIAL, a CCI account can set it to FIELD_SALES, and that sticks across requests - never
 * an access-control change, just what /context reports back.
 */
@SpringBootTest
class AnalyticsControllerCommercialRoleTest {

    @Autowired
    private WebApplicationContext applicationContext;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ScanAccountRepository accountRepository;

    @Autowired
    private RetailerRepository retailerRepository;

    @Autowired
    private FieldTaskRepository fieldTaskRepository;

    @Autowired
    private InvestigationRepository investigationRepository;

    @Autowired
    private ActivationRepository cciActivationRepository;

    @Autowired
    private WatchlistItemRepository watchlistItemRepository;

    @Autowired
    private RetailerOfferActivationRepository activationRepository;

    @Autowired
    private OperationalAuditEventRepository auditEventRepository;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private RetailerProductRepository retailerProductRepository;

    @Autowired
    private ImportJobRepository importJobRepository;

    @Autowired
    private ImportPreviewRepository importPreviewRepository;

    @Autowired
    private ImportProfileRepository importProfileRepository;

    @Autowired
    private StoreRepository storeRepository;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = webAppContextSetup(applicationContext).apply(springSecurity()).build();

        fieldTaskRepository.deleteAll();
        cciActivationRepository.deleteAll();
        watchlistItemRepository.deleteAll();
        investigationRepository.deleteAll();
        activationRepository.deleteAll();
        auditEventRepository.deleteAll();
        accountRepository.deleteAll();
        receiptRepository.deleteAll();
        retailerProductRepository.deleteAll();
        importJobRepository.deleteAll();
        importPreviewRepository.deleteAll();
        importProfileRepository.deleteAll();
        storeRepository.deleteAll();
        retailerRepository.deleteAll();

        Retailer retailer = retailerRepository.save(new Retailer("ROLE", "Commercial Role Test Shop", "Asia/Baku", true));
        ScanAccount account = accountRepository.save(new ScanAccount(
            "role-cci", passwordEncoder.encode("role-cci-password"), ScanAccount.Role.CCI, null, null
        ));
        account.grantRetailerAccess(retailer);
        accountRepository.save(account);
    }

    @Test
    void defaultsToCommercialAndCanBeSetToFieldSalesByTheAccountItself() throws Exception {
        mockMvc.perform(get("/api/v1/analytics/context")
                .with(httpBasic("role-cci", "role-cci-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.commercialRole").value("COMMERCIAL"));

        mockMvc.perform(put("/api/v1/analytics/context/commercial-role")
                .with(httpBasic("role-cci", "role-cci-password"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"commercialRole": "FIELD_SALES"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.commercialRole").value("FIELD_SALES"));

        mockMvc.perform(get("/api/v1/analytics/context")
                .with(httpBasic("role-cci", "role-cci-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.commercialRole").value("FIELD_SALES"));
    }
}
