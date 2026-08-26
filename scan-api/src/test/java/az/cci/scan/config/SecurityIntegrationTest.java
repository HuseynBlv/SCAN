package az.cci.scan.config;

import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.context.WebApplicationContext;

import java.nio.charset.StandardCharsets;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

@SpringBootTest
class SecurityIntegrationTest {

    @Autowired
    private WebApplicationContext applicationContext;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private RetailerProductRepository retailerProductRepository;

    @Autowired
    private ImportJobRepository importJobRepository;

    @Autowired
    private CanonicalProductRepository canonicalProductRepository;

    @Autowired
    private ImportProfileRepository importProfileRepository;

    @Autowired
    private StoreRepository storeRepository;

    @Autowired
    private RetailerRepository retailerRepository;

    private org.springframework.test.web.servlet.MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = webAppContextSetup(applicationContext).apply(springSecurity()).build();
        receiptRepository.deleteAll();
        retailerProductRepository.deleteAll();
        importJobRepository.deleteAll();
        canonicalProductRepository.deleteAll();
        importProfileRepository.deleteAll();
        storeRepository.deleteAll();
        retailerRepository.deleteAll();

        Retailer shared = retailerRepository.save(new Retailer(
            "SHARED",
            "Shared Retailer",
            "Asia/Baku",
            true
        ));
        importProfileRepository.save(new ImportProfile(
            shared,
            "CANONICAL",
            "security-test",
            "yyyy-MM-dd'T'HH:mm:ss",
            "Asia/Baku",
            "AZN"
        ));
        retailerRepository.save(new Retailer(
            "PRIVATE",
            "Private Retailer",
            "Asia/Baku",
            false
        ));
    }

    @Test
    void requiresAuthenticationForAnalytics() throws Exception {
        mockMvc.perform(get("/api/v1/analytics/overview").param("retailerCode", "SHARED"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void letsCciReadOnlySharedAggregates() throws Exception {
        mockMvc.perform(get("/api/v1/analytics/overview")
                .param("retailerCode", "SHARED")
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.retailerCode").value("SHARED"))
            .andExpect(jsonPath("$.totalBaskets").value(0));
    }

    @Test
    void blocksCciFromPrivateRetailerAggregates() throws Exception {
        mockMvc.perform(get("/api/v1/analytics/overview")
                .param("retailerCode", "PRIVATE")
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());
    }

    @Test
    void letsOnlyAdminsImportTransactions() throws Exception {
        MockMultipartFile file = transactionFile();

        mockMvc.perform(multipart("/api/v1/imports")
                .file(file)
                .param("retailerCode", "SHARED")
                .param("profileCode", "CANONICAL")
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());

        mockMvc.perform(multipart("/api/v1/imports")
                .file(transactionFile())
                .param("retailerCode", "SHARED")
                .param("profileCode", "CANONICAL")
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    private MockMultipartFile transactionFile() {
        String csv = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-01,R-1,2026-08-24T10:00:00,LOCAL-1,,Local Product,1,1.00,0.00,1.00
            """;
        return new MockMultipartFile(
            "file",
            "security-test.csv",
            "text/csv",
            csv.getBytes(StandardCharsets.UTF_8)
        );
    }
}
