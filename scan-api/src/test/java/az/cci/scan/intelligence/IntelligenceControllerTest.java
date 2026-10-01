package az.cci.scan.intelligence;

import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.ScanAccount;
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
import com.jayway.jsonpath.JsonPath;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

/**
 * End-to-end through real HTTP + Spring Security: a CCI account opens an investigation, creates a
 * field task against it, records a result, and sees the field-check evidence reflected back into
 * the investigation - and an account with no grant to the retailer is refused, the same tenant
 * boundary AnalyticsController already enforces.
 */
@SpringBootTest
class IntelligenceControllerTest {

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
    private Retailer retailer;

    @BeforeEach
    void setUp() {
        mockMvc = webAppContextSetup(applicationContext).apply(springSecurity()).build();

        fieldTaskRepository.deleteAll();
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

        retailer = retailerRepository.save(new Retailer("INTEL", "Intelligence Controller Test Shop", "Asia/Baku", true));

        ScanAccount granted = accountRepository.save(new ScanAccount(
            "intel-cci", passwordEncoder.encode("intel-cci-password"), ScanAccount.Role.CCI, null, null
        ));
        granted.grantRetailerAccess(retailer);
        accountRepository.save(granted);

        accountRepository.save(new ScanAccount(
            "intel-cci-unauthorized", passwordEncoder.encode("intel-cci-unauthorized-password"), ScanAccount.Role.CCI, null, null
        ));
    }

    @Test
    void opensAFieldCheckThatReflectsBackIntoTheInvestigationOverRealHttp() throws Exception {
        String investigationResponse = mockMvc.perform(post("/api/v1/investigations/general")
                .param("retailerCode", "INTEL")
                .with(httpBasic("intel-cci", "intel-cci-password"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title": "Why is the north region soft?", "question": "What changed in the north region?"}
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("OPEN"))
            .andExpect(jsonPath("$.hypotheses").isEmpty())
            .andReturn().getResponse().getContentAsString();
        String investigationId = JsonPath.read(investigationResponse, "$.id");

        mockMvc.perform(post("/api/v1/investigations/" + investigationId + "/hypotheses")
                .param("retailerCode", "INTEL")
                .with(httpBasic("intel-cci", "intel-cci-password"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "statement": "Availability issue: the product may not be consistently in stock.",
                      "supportingEvidence": "Basket presence dropped near zero in Store A.",
                      "confidence": "MEDIUM"
                    }
                    """))
            .andExpect(status().isCreated());

        String taskResponse = mockMvc.perform(post("/api/v1/field-tasks")
                .param("retailerCode", "INTEL")
                .with(httpBasic("intel-cci", "intel-cci-password"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "investigationId": "%s",
                      "title": "Check availability in Store A",
                      "reason": "Basket presence dropped to zero",
                      "assignedTo": "Field Sales Team",
                      "storeIds": ["STORE-A"]
                    }
                    """.formatted(investigationId)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("OPEN"))
            .andReturn().getResponse().getContentAsString();
        String taskId = JsonPath.read(taskResponse, "$.id");

        mockMvc.perform(post("/api/v1/field-tasks/" + taskId + "/results/STORE-A")
                .param("retailerCode", "INTEL")
                .with(httpBasic("intel-cci", "intel-cci-password"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"stockAvailable": false, "visibleInCooler": true, "correctPlacement": true, "competitorPresent": false, "note": "Shelf was empty"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("COMPLETED"));

        mockMvc.perform(get("/api/v1/investigations/" + investigationId)
                .param("retailerCode", "INTEL")
                .with(httpBasic("intel-cci", "intel-cci-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.notes[?(@.system == true)].body",
                org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("1 of 1 stores reported an issue"))))
            .andExpect(jsonPath("$.hypotheses[0].confidence").value("HIGH"))
            .andExpect(jsonPath("$.hypotheses[0].supportingEvidence", org.hamcrest.Matchers.containsString("Field check confirmed")));
    }

    @Test
    void refusesAnAccountWithNoGrantToThisRetailer() throws Exception {
        mockMvc.perform(get("/api/v1/investigations")
                .param("retailerCode", "INTEL")
                .with(httpBasic("intel-cci-unauthorized", "intel-cci-unauthorized-password")))
            .andExpect(status().isForbidden());
    }

    @Test
    void refusesAnUnauthenticatedRequest() throws Exception {
        mockMvc.perform(get("/api/v1/investigations").param("retailerCode", "INTEL"))
            .andExpect(status().isUnauthorized());
    }
}
