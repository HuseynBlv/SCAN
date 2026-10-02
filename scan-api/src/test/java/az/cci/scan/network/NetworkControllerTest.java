package az.cci.scan.network;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.ScanAccount;
import az.cci.scan.importing.ImportService;
import az.cci.scan.repository.ActivationRepository;
import az.cci.scan.repository.CanonicalProductRepository;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

/**
 * Real HTTP + security: a CCI account with access to two retailers sees both aggregated with no
 * retailerCode parameter anywhere, and an account with no retailer grants is refused rather than
 * hitting the database with an empty "in ()" clause.
 */
@SpringBootTest
class NetworkControllerTest {

    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    @Autowired
    private WebApplicationContext applicationContext;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ImportService importService;

    @Autowired
    private ScanAccountRepository accountRepository;

    @Autowired
    private RetailerRepository retailerRepository;

    @Autowired
    private FieldTaskRepository fieldTaskRepository;

    @Autowired
    private ActivationRepository cciActivationRepository;

    @Autowired
    private WatchlistItemRepository watchlistItemRepository;

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

    @Autowired
    private CanonicalProductRepository canonicalProductRepository;

    private MockMvc mockMvc;
    private int receiptCounter;

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
        canonicalProductRepository.deleteAll();
        retailerRepository.deleteAll();
        receiptCounter = 0;
    }

    @Test
    void aggregatesTwoGrantedRetailersWithNoRetailerCodeParameter() throws Exception {
        canonicalProductRepository.save(new CanonicalProduct(
            "Sprite 500ml", "5449000015101", "The Coca-Cola Company", "The Coca-Cola Company", "Beverages", null, null, null, true
        ));
        Retailer retailerA = retailerRepository.save(new Retailer("NETC-A", "Network Controller Test A", "Asia/Baku", true));
        Retailer retailerB = retailerRepository.save(new Retailer("NETC-B", "Network Controller Test B", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(retailerA, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"));
        importProfileRepository.save(new ImportProfile(retailerB, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"));

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        importCsv(retailerA, header() + spriteRow("A-1", today.minusDays(1).atTime(12, 0)));
        importCsv(retailerB, header() + spriteRow("B-1", today.minusDays(1).atTime(12, 0)));

        ScanAccount account = accountRepository.save(new ScanAccount(
            "netc-cci", passwordEncoder.encode("netc-cci-password"), ScanAccount.Role.CCI, null, null
        ));
        account.grantRetailerAccess(retailerA);
        account.grantRetailerAccess(retailerB);
        accountRepository.save(account);

        mockMvc.perform(get("/api/v1/network/overview")
                .with(httpBasic("netc-cci", "netc-cci-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.storesReporting").value(2))
            .andExpect(jsonPath("$.totalBaskets").value(2))
            .andExpect(jsonPath("$.cciBaskets").value(2));

        mockMvc.perform(get("/api/v1/network/stores")
                .with(httpBasic("netc-cci", "netc-cci-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[*].retailerCode", org.hamcrest.Matchers.containsInAnyOrder("NETC-A", "NETC-B")));
    }

    @Test
    void returnsStoreDetailForAGrantedRetailerAndRefusesAnUngrantedOne() throws Exception {
        canonicalProductRepository.save(new CanonicalProduct(
            "Sprite 500ml", "5449000015101", "The Coca-Cola Company", "The Coca-Cola Company", "Beverages", null, null, null, true
        ));
        Retailer granted = retailerRepository.save(new Retailer("NETC-G", "Network Controller Test Granted", "Asia/Baku", true));
        Retailer ungranted = retailerRepository.save(new Retailer("NETC-U", "Network Controller Test Ungranted", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(granted, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"));
        importProfileRepository.save(new ImportProfile(ungranted, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"));

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        importCsv(granted, header() + spriteRow("G-1", today.minusDays(1).atTime(12, 0)));
        importCsv(ungranted, header() + spriteRow("U-1", today.minusDays(1).atTime(12, 0)));

        ScanAccount account = accountRepository.save(new ScanAccount(
            "netc-store-detail", passwordEncoder.encode("netc-store-detail-password"), ScanAccount.Role.CCI, null, null
        ));
        account.grantRetailerAccess(granted);
        accountRepository.save(account);

        mockMvc.perform(get("/api/v1/network/stores/detail")
                .param("retailerCode", "NETC-G")
                .param("externalStoreId", "G-1")
                .with(httpBasic("netc-store-detail", "netc-store-detail-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.retailerCode").value("NETC-G"))
            .andExpect(jsonPath("$.externalStoreId").value("G-1"))
            .andExpect(jsonPath("$.recentCciBaskets").value(1));

        // The account was never granted NETC-U, so asking for its store must be refused even
        // though the store itself is real - a granted retailer cannot be used to probe another.
        mockMvc.perform(get("/api/v1/network/stores/detail")
                .param("retailerCode", "NETC-U")
                .param("externalStoreId", "U-1")
                .with(httpBasic("netc-store-detail", "netc-store-detail-password")))
            .andExpect(status().isForbidden());
    }

    @Test
    void returnsProductDetailAggregatedAcrossGrantedRetailers() throws Exception {
        canonicalProductRepository.save(new CanonicalProduct(
            "Sprite 500ml", "5449000015101", "The Coca-Cola Company", "The Coca-Cola Company", "Beverages", null, null, null, true
        ));
        Retailer retailerA = retailerRepository.save(new Retailer("NETC-PA", "Network Controller Product Test A", "Asia/Baku", true));
        Retailer retailerB = retailerRepository.save(new Retailer("NETC-PB", "Network Controller Product Test B", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(retailerA, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"));
        importProfileRepository.save(new ImportProfile(retailerB, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"));

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        importCsv(retailerA, header() + spriteRow("PA-1", today.minusDays(1).atTime(12, 0)));
        importCsv(retailerB, header() + spriteRow("PB-1", today.minusDays(1).atTime(12, 0)));

        ScanAccount account = accountRepository.save(new ScanAccount(
            "netc-product-detail", passwordEncoder.encode("netc-product-detail-password"), ScanAccount.Role.CCI, null, null
        ));
        account.grantRetailerAccess(retailerA);
        account.grantRetailerAccess(retailerB);
        accountRepository.save(account);

        mockMvc.perform(get("/api/v1/network/products/detail")
                .param("product", "Sprite 500ml")
                .with(httpBasic("netc-product-detail", "netc-product-detail-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.product").value("Sprite 500ml"))
            .andExpect(jsonPath("$.recentBaskets").value(2))
            .andExpect(jsonPath("$.storeDistribution.length()").value(2));
    }

    @Test
    void answersANetworkWideCopilotProductQuestionWithNoRetailerCodeParameter() throws Exception {
        canonicalProductRepository.save(new CanonicalProduct(
            "Sprite 500ml", "5449000015101", "The Coca-Cola Company", "The Coca-Cola Company", "Beverages", null, null, null, true
        ));
        Retailer retailerA = retailerRepository.save(new Retailer("NETC-CA", "Network Controller Copilot Test A", "Asia/Baku", true));
        Retailer retailerB = retailerRepository.save(new Retailer("NETC-CB", "Network Controller Copilot Test B", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(retailerA, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"));
        importProfileRepository.save(new ImportProfile(retailerB, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"));

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        importCsv(retailerA, header() + spriteRow("CA-1", today.minusDays(1).atTime(12, 0)));
        importCsv(retailerB, header() + spriteRow("CB-1", today.minusDays(1).atTime(12, 0)));

        ScanAccount account = accountRepository.save(new ScanAccount(
            "netc-copilot", passwordEncoder.encode("netc-copilot-password"), ScanAccount.Role.CCI, null, null
        ));
        account.grantRetailerAccess(retailerA);
        account.grantRetailerAccess(retailerB);
        accountRepository.save(account);

        mockMvc.perform(post("/api/v1/network/copilot/ask")
                .with(httpBasic("netc-copilot", "netc-copilot-password"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"contextType": "PRODUCT", "subjectName": "Sprite 500ml", "periodDays": 14, "question": "What changed?"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.whatScanFound", org.hamcrest.Matchers.containsString("Sprite 500ml")))
            .andExpect(jsonPath("$.whatScanFound", org.hamcrest.Matchers.containsString("2 baskets")));
    }

    @Test
    void refusesAnAccountWithNoRetailerGrantsInsteadOfQueryingWithAnEmptyList() throws Exception {
        accountRepository.save(new ScanAccount(
            "netc-ungranted", passwordEncoder.encode("netc-ungranted-password"), ScanAccount.Role.CCI, null, null
        ));

        mockMvc.perform(get("/api/v1/network/overview")
                .with(httpBasic("netc-ungranted", "netc-ungranted-password")))
            .andExpect(status().isForbidden());
    }

    private String header() {
        return "store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total\n";
    }

    private String spriteRow(String storeId, LocalDateTime timestamp) {
        receiptCounter++;
        return storeId + ",R-" + receiptCounter + "," + TIMESTAMP_FORMAT.format(timestamp)
            + ",SPRITE,5449000015101,Sprite 500ml,1,2.50,0.00,2.50\n";
    }

    private void importCsv(Retailer retailer, String csv) {
        importService.importFile(retailer.getCode(), "CANONICAL", new MockMultipartFile(
            "file", "fixture.csv", "text/csv", csv.getBytes()
        ));
    }
}
