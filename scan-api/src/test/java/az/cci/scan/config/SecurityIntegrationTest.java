package az.cci.scan.config;

import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Retailer;
import az.cci.scan.domain.ScanAccount;
import az.cci.scan.domain.Store;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.ImportPreviewRepository;
import az.cci.scan.repository.ReceiptRepository;
import az.cci.scan.repository.RetailerProductRepository;
import az.cci.scan.repository.RetailerRepository;
import az.cci.scan.repository.StoreRepository;
import az.cci.scan.repository.ScanAccountRepository;
import az.cci.scan.repository.ImportPayloadRepository;
import az.cci.scan.repository.OperationalAuditEventRepository;
import az.cci.scan.importing.ImportJobWorker;
import com.jayway.jsonpath.JsonPath;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.http.MediaType;
import org.springframework.web.context.WebApplicationContext;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
    private ImportPreviewRepository importPreviewRepository;

    @Autowired
    private CanonicalProductRepository canonicalProductRepository;

    @Autowired
    private ImportProfileRepository importProfileRepository;

    @Autowired
    private StoreRepository storeRepository;

    @Autowired
    private RetailerRepository retailerRepository;

    @Autowired
    private ScanAccountRepository accountRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ImportPayloadRepository importPayloadRepository;

    @Autowired
    private OperationalAuditEventRepository auditRepository;

    @Autowired
    private ImportJobWorker importJobWorker;

    private org.springframework.test.web.servlet.MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = webAppContextSetup(applicationContext).apply(springSecurity()).build();
        auditRepository.deleteAll();
        importPayloadRepository.deleteAll();
        accountRepository.deleteAll();
        receiptRepository.deleteAll();
        retailerProductRepository.deleteAll();
        importJobRepository.deleteAll();
        importPreviewRepository.deleteAll();
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
        ImportProfile sharedProfile = importProfileRepository.save(new ImportProfile(
            shared,
            "CANONICAL",
            "security-test",
            "yyyy-MM-dd'T'HH:mm:ss",
            "Asia/Baku",
            "AZN"
        ));
        storeRepository.save(new Store(shared, "STORE-01", "Shared store"));
        Retailer privateRetailer = retailerRepository.save(new Retailer(
            "PRIVATE",
            "Private Retailer",
            "Asia/Baku",
            false
        ));
        ImportProfile privateProfile = importProfileRepository.save(new ImportProfile(
            privateRetailer,
            "PRIVATE_FORMAT",
            "security-test-private",
            "yyyy-MM-dd'T'HH:mm:ss",
            "Asia/Baku",
            "AZN"
        ));
        storeRepository.save(new Store(privateRetailer, "STORE-01", "Private store"));
        Retailer lockedDemo = retailerRepository.save(new Retailer(
            "KAGGLE",
            "Locked demo",
            "Asia/Baku",
            true,
            false
        ));
        ImportProfile lockedProfile = importProfileRepository.save(new ImportProfile(
            lockedDemo,
            "KAGGLE_2019",
            "locked-demo",
            "yyyy-MM-dd'T'HH:mm:ss",
            "Asia/Baku",
            "AZN"
        ));

        account("test-admin", "test-admin-password", ScanAccount.Role.ADMIN, shared, sharedProfile);
        ScanAccount cciAccount = account(
            "test-cci",
            "test-cci-password",
            ScanAccount.Role.CCI,
            null,
            null
        );
        cciAccount.grantRetailerAccess(shared);
        accountRepository.save(cciAccount);
        account("test-connector", "test-connector-password", ScanAccount.Role.INGEST, shared, sharedProfile);
        account("test-retailer", "test-retailer-password", ScanAccount.Role.RETAILER, shared, null);
        account("private-admin", "private-admin-password", ScanAccount.Role.ADMIN, privateRetailer, privateProfile);
        account("kaggle-admin", "kaggle-admin-password", ScanAccount.Role.ADMIN, lockedDemo, lockedProfile);
        account("test-onboarding", "test-onboarding-password", ScanAccount.Role.ONBOARDING, null, null);
    }

    @Test
    void exposesOnlyMinimalPublicHealth() throws Exception {
        mockMvc.perform(get("/health"))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"status\":\"UP\"}"))
            .andExpect(header().string("Cache-Control", "no-store"));
        mockMvc.perform(head("/health")).andExpect(status().isOk());
    }

    @Test
    void servesPublicFrontendWithoutGrantingApiAccess() throws Exception {
        mockMvc.perform(get("/")).andExpect(status().isOk());
        mockMvc.perform(get("/index.html"))
            .andExpect(status().isOk())
            .andExpect(content().string(org.hamcrest.Matchers.containsString("SCAN test frontend")));
        mockMvc.perform(get("/assets/security-test.js"))
            .andExpect(status().isOk());
        mockMvc.perform(head("/assets/security-test.js"))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/product-mappings/catalog"))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/unknown"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void publicRoutesDoNotAllowAnonymousWritesOrPrivateCatalogAccess() throws Exception {
        mockMvc.perform(post("/health")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/index.html")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/product-mappings/catalog")
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());
    }

    @Test
    void requiresAuthenticationForAnalytics() throws Exception {
        mockMvc.perform(get("/api/v1/analytics/overview").param("retailerCode", "SHARED"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void letsCciReadOnlySharedAggregates() throws Exception {
        mockMvc.perform(get("/api/v1/analytics/context")
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.retailers.length()").value(1))
            .andExpect(jsonPath("$.retailers[0].code").value("SHARED"));

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
    void blocksCciFromSharedRetailerWithoutAnAccountGrant() throws Exception {
        retailerRepository.save(new Retailer(
            "OTHER_SHARED",
            "Other Shared Retailer",
            "Asia/Baku",
            true
        ));

        mockMvc.perform(get("/api/v1/analytics/overview")
                .param("retailerCode", "OTHER_SHARED")
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());
    }

    @Test
    void blocksCciWhenRetailerSharingIsDisabledAfterGrant() throws Exception {
        Retailer shared = retailerRepository.findByCodeIgnoreCase("SHARED").orElseThrow();
        shared.setCciSharingEnabled(false);
        retailerRepository.save(shared);

        mockMvc.perform(get("/api/v1/analytics/overview")
                .param("retailerCode", "SHARED")
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());
    }

    @Test
    void letsOnlyAdminsImportTransactions() throws Exception {
        MockMultipartFile file = transactionFile();

        mockMvc.perform(multipart("/api/v1/imports")
                .file(file)
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());

        String previewId = previewId("test-admin", "test-admin-password");
        mockMvc.perform(multipart("/api/v1/imports")
                .file(transactionFile())
                .param("previewId", previewId)
                .param("retailerCode", "PRIVATE")
                .param("profileCode", "PRIVATE_FORMAT")
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.retailerCode").value("SHARED"))
            .andExpect(jsonPath("$.profileCode").value("CANONICAL"))
            .andExpect(jsonPath("$.status").value("RECEIVED"));

        mockMvc.perform(get("/api/v1/imports/history")
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].status").value("RECEIVED"))
            .andExpect(jsonPath("$[0].submittedBy").value("test-admin"));
        mockMvc.perform(get("/api/v1/imports/audit")
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].eventType").value("IMPORT_QUEUED"));
        mockMvc.perform(get("/api/v1/imports/operations")
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.queued").value(1));
    }

    @Test
    void onlyAdminsCanDeleteImportJobsAndNotBeforeTheyFinish() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(
                "/api/v1/imports/{jobId}", java.util.UUID.randomUUID()
            ).with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());

        String previewId = previewId("test-admin", "test-admin-password");
        String jobJson = mockMvc.perform(multipart("/api/v1/imports")
                .file(transactionFile())
                .param("previewId", previewId)
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("RECEIVED"))
            .andReturn().getResponse().getContentAsString();
        String jobId = JsonPath.read(jobJson, "$.id");

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(
                "/api/v1/imports/{jobId}", jobId
            ).with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(
                "/api/v1/imports/{jobId}", jobId
            ).with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", org.hamcrest.Matchers.containsString("still RECEIVED")));
    }

    @Test
    void returnsImportContextFromTheAccountAndNeverFromQueryParameters() throws Exception {
        mockMvc.perform(get("/api/v1/imports/context")
                .param("retailerCode", "PRIVATE")
                .param("profileCode", "PRIVATE_FORMAT")
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.retailerCode").value("SHARED"))
            .andExpect(jsonPath("$.profileCode").value("CANONICAL"))
            .andExpect(jsonPath("$.importEnabled").value(true));
    }

    @Test
    void letsTheBoundAdministratorMapAnUnknownFileAndValidateAgain() throws Exception {
        MockMultipartFile unknown = unknownFormatFile();
        mockMvc.perform(multipart("/api/v1/imports/preview")
                .file(unknown)
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.readyForImport").value(false))
            .andExpect(jsonPath("$.mappingRequired").value(true))
            .andExpect(jsonPath("$.detectedColumns.length()").value(8));

        mockMvc.perform(put("/api/v1/imports/profile")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "delimiter": ",",
                      "dateTimePattern": "yyyy-MM-dd'T'HH:mm:ss",
                      "columns": {
                        "storeId": "store",
                        "receiptId": "receipt number",
                        "timestamp": "datetime",
                        "productCode": null,
                        "barcode": null,
                        "productName": "item",
                        "quantity": "qty",
                        "unitPrice": "price",
                        "discountAmount": "discount",
                        "lineTotal": "total"
                      }
                    }
                    """)
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sampleValidated").value(false))
            .andExpect(jsonPath("$.mapping.storeId").value("store"));

        mockMvc.perform(multipart("/api/v1/imports/preview")
                .file(unknownFormatFile())
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.readyForImport").value(true))
            .andExpect(jsonPath("$.receiptsDetected").value(1))
            .andExpect(jsonPath("$.reportedNetSales").value(1.0));
    }

    @Test
    void refusesToImportAFileThatChangedAfterReconciliation() throws Exception {
        String previewId = previewId("test-admin", "test-admin-password");

        mockMvc.perform(multipart("/api/v1/imports")
                .file(changedTransactionFile())
                .param("previewId", previewId)
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(
                org.hamcrest.Matchers.containsString("changed after reconciliation")
            ));
        org.assertj.core.api.Assertions.assertThat(receiptRepository.count()).isZero();
    }

    @Test
    void lockedKaggleTenantRejectsTransactionImports() throws Exception {
        mockMvc.perform(multipart("/api/v1/imports")
                .file(transactionFile())
                .param("previewId", UUID.randomUUID().toString())
            .with(httpBasic("kaggle-admin", "kaggle-admin-password")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(
                org.hamcrest.Matchers.containsString("does not accept transaction imports")
            ));
    }

    @Test
    void onboardingCreatesAnIsolatedRetailerValidatesWithoutWritingAndIssuesBoundCredentials()
        throws Exception {
        mockMvc.perform(get("/api/v1/onboarding/retailers")
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isForbidden());

        String retailerJson = mockMvc.perform(post("/api/v1/onboarding/retailers")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Fresh Market",
                      "zoneId": "Asia/Baku",
                      "stores": [{"externalStoreId": "FRESH-01", "name": "Central store"}]
                    }
                    """)
                .with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.code").value(org.hamcrest.Matchers.startsWith("FRESH_MARKET_")))
            .andExpect(jsonPath("$.importEnabled").value(false))
            .andExpect(jsonPath("$.stores[0].externalStoreId").value("FRESH-01"))
            .andReturn().getResponse().getContentAsString();
        String retailerId = JsonPath.read(retailerJson, "$.id");
        String retailerCode = JsonPath.read(retailerJson, "$.code");

        String profileJson = mockMvc.perform(post(
                "/api/v1/onboarding/retailers/{retailerId}/import-formats",
                retailerId
            )
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Daily sales export",
                      "sourceSystem": "Retailer Excel",
                      "delimiter": ",",
                      "dateTimePattern": "yyyy-MM-dd'T'HH:mm:ss",
                      "currency": "AZN",
                      "columns": {
                        "storeId": "store_id",
                        "receiptId": "receipt_id",
                        "timestamp": "transaction_timestamp",
                        "productCode": "product_code",
                        "barcode": "barcode",
                        "productName": "product_name",
                        "quantity": "quantity",
                        "unitPrice": "unit_price",
                        "discountAmount": "discount_amount",
                        "lineTotal": "line_total"
                      }
                    }
                    """)
                .with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("Daily sales export"))
            .andExpect(jsonPath("$.validationStatus").value("DRAFT"))
            .andReturn().getResponse().getContentAsString();
        String profileId = JsonPath.read(profileJson, "$.id");

        mockMvc.perform(post(
                "/api/v1/onboarding/retailers/{retailerId}/import-formats/{profileId}/credentials",
                retailerId,
                profileId
            ).with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(
                org.hamcrest.Matchers.containsString("Validate a sample export")
            ));

        MockMultipartFile sample = onboardingSample("FRESH-01");
        mockMvc.perform(multipart(
                "/api/v1/onboarding/retailers/{retailerId}/import-formats/{profileId}/sample-validation",
                retailerId,
                profileId
            )
                .file(sample)
                .with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.valid").value(true))
            .andExpect(jsonPath("$.rowsChecked").value(1))
            .andExpect(jsonPath("$.receiptsDetected").value(1))
            .andExpect(jsonPath("$.productLines").value(1));
        org.assertj.core.api.Assertions.assertThat(receiptRepository.count()).isZero();

        String credentialsJson = mockMvc.perform(post(
                "/api/v1/onboarding/retailers/{retailerId}/import-formats/{profileId}/credentials",
                retailerId,
                profileId
            ).with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isCreated())
            .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
            .andExpect(jsonPath("$.retailerCode").value(retailerCode))
            .andExpect(jsonPath("$.credentials.length()").value(3))
            .andReturn().getResponse().getContentAsString();
        String adminUsername = JsonPath.read(credentialsJson, "$.credentials[1].username");
        String adminPassword = JsonPath.read(credentialsJson, "$.credentials[1].password");

        mockMvc.perform(get("/api/v1/imports/context")
                .param("retailerCode", "KAGGLE")
                .with(httpBasic(adminUsername, adminPassword)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.retailerCode").value(retailerCode))
            .andExpect(jsonPath("$.profileName").value("Daily sales export"))
            .andExpect(jsonPath("$.sampleValidated").value(true));

        String accessJson = mockMvc.perform(get(
                "/api/v1/onboarding/retailers/{retailerId}/credentials", retailerId
            ).with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(3))
            .andReturn().getResponse().getContentAsString();
        String adminAccountId = JsonPath.read(accessJson, "$[?(@.role == 'ADMIN')].id").toString()
            .replace("[\"", "").replace("\"]", "");
        String rotatedJson = mockMvc.perform(post(
                "/api/v1/onboarding/retailers/{retailerId}/credentials/{accountId}/rotate",
                retailerId, adminAccountId
            ).with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
            .andExpect(jsonPath("$.credential.enabled").value(true))
            .andReturn().getResponse().getContentAsString();
        String rotatedPassword = JsonPath.read(rotatedJson, "$.password");
        mockMvc.perform(get("/api/v1/imports/context").with(httpBasic(adminUsername, adminPassword)))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/imports/context").with(httpBasic(adminUsername, rotatedPassword)))
            .andExpect(status().isOk());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(
                "/api/v1/onboarding/retailers/{retailerId}/credentials/{accountId}",
                retailerId, adminAccountId
            ).with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(false));
        mockMvc.perform(get("/api/v1/imports/context").with(httpBasic(adminUsername, rotatedPassword)))
            .andExpect(status().isUnauthorized());

        mockMvc.perform(post(
                "/api/v1/onboarding/retailers/{retailerId}/import-formats/{profileId}/credentials",
                retailerId,
                profileId
            ).with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(
                org.hamcrest.Matchers.containsString("already been issued")
            ));

        mockMvc.perform(get("/api/v1/analytics/overview")
                .param("retailerCode", retailerCode)
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/v1/onboarding/retailers/{retailerId}/cci-sharing", retailerId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\": true}")
                .with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cciSharingEnabled").value(true));
        mockMvc.perform(get("/api/v1/analytics/overview")
                .param("retailerCode", retailerCode)
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.retailerCode").value(retailerCode));
        mockMvc.perform(put("/api/v1/onboarding/retailers/{retailerId}/cci-sharing", retailerId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\": false}")
                .with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cciSharingEnabled").value(false));
        mockMvc.perform(get("/api/v1/analytics/overview")
                .param("retailerCode", retailerCode)
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());
    }

    @Test
    void sampleWithAnUnknownStoreDoesNotUnlockProductionImports() throws Exception {
        String retailerJson = mockMvc.perform(post("/api/v1/onboarding/retailers")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Store Check",
                      "zoneId": "Asia/Baku",
                      "stores": [{"externalStoreId": "KNOWN-01", "name": "Known store"}]
                    }
                    """)
                .with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        String retailerId = JsonPath.read(retailerJson, "$.id");
        String profileJson = mockMvc.perform(post(
                "/api/v1/onboarding/retailers/{retailerId}/import-formats",
                retailerId
            )
                .contentType(MediaType.APPLICATION_JSON)
                .content(canonicalProfileJson())
                .with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        String profileId = JsonPath.read(profileJson, "$.id");

        mockMvc.perform(multipart(
                "/api/v1/onboarding/retailers/{retailerId}/import-formats/{profileId}/sample-validation",
                retailerId,
                profileId
            )
                .file(onboardingSample("UNKNOWN-01"))
                .with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.valid").value(false))
            .andExpect(jsonPath("$.errors[0]").value(
                org.hamcrest.Matchers.containsString("is not registered")
            ));

        mockMvc.perform(get("/api/v1/onboarding/retailers")
                .with(httpBasic("test-onboarding", "test-onboarding-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id == '" + retailerId + "')].importEnabled").value(false));
    }

    @Test
    void tenantBoundAdminCannotReadAnotherRetailersJobsOrUnresolvedProducts() throws Exception {
        String previewId = previewId("private-admin", "private-admin-password");
        String response = mockMvc.perform(multipart("/api/v1/imports")
                .file(transactionFile())
                .param("previewId", previewId)
                .with(httpBasic("private-admin", "private-admin-password")))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.retailerCode").value("PRIVATE"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        String privateJobId = JsonPath.read(response, "$.id");
        org.assertj.core.api.Assertions.assertThat(importJobWorker.runOnce()).isTrue();

        mockMvc.perform(get("/api/v1/imports/{jobId}", privateJobId)
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/v1/imports/{jobId}", privateJobId)
                .with(httpBasic("private-admin", "private-admin-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.retailerCode").value("PRIVATE"));

        mockMvc.perform(get("/api/v1/product-mappings/unresolved")
                .param("retailerCode", "PRIVATE")
                .with(httpBasic("test-admin", "test-admin-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$").isEmpty());
        mockMvc.perform(get("/api/v1/product-mappings/unresolved")
                .with(httpBasic("private-admin", "private-admin-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].retailerCode").value("PRIVATE"));
    }

    @Test
    void letsConnectorImportOnlyForItsServerBoundRetailerAndProfile() throws Exception {
        mockMvc.perform(multipart("/api/v1/connector/imports")
                .file(transactionFile())
                .param("retailerCode", "PRIVATE")
                .param("profileCode", "DOES_NOT_EXIST")
            .with(httpBasic("test-connector", "test-connector-password")))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.retailerCode").value("SHARED"))
            .andExpect(jsonPath("$.profileCode").value("CANONICAL"))
            .andExpect(jsonPath("$.status").value("RECEIVED"));
    }

    @Test
    void connectorCannotUseAdminImportOrReadAnalytics() throws Exception {
        mockMvc.perform(multipart("/api/v1/imports")
                .file(transactionFile())
                .with(httpBasic("test-connector", "test-connector-password")))
            .andExpect(status().isForbidden());

        mockMvc.perform(multipart("/api/v1/imports/preview")
                .file(transactionFile())
                .with(httpBasic("test-connector", "test-connector-password")))
            .andExpect(status().isForbidden());

        mockMvc.perform(put("/api/v1/imports/profile")
                .contentType(MediaType.APPLICATION_JSON)
                .content(canonicalProfileJson())
                .with(httpBasic("test-connector", "test-connector-password")))
            .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/v1/analytics/overview")
                .param("retailerCode", "SHARED")
                .with(httpBasic("test-connector", "test-connector-password")))
            .andExpect(status().isForbidden());
    }

    @Test
    void cciAndRetailerUsersCannotUseConnectorUpload() throws Exception {
        mockMvc.perform(multipart("/api/v1/connector/imports")
                .file(transactionFile())
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());

        mockMvc.perform(multipart("/api/v1/connector/imports")
                .file(transactionFile())
                .with(httpBasic("test-retailer", "test-retailer-password")))
            .andExpect(status().isForbidden());
    }

    @Test
    void retailerReadsOnlyTheServerBoundRetailerDashboard() throws Exception {
        mockMvc.perform(multipart("/api/v1/connector/imports")
            .file(transactionFile())
            .with(httpBasic("test-connector", "test-connector-password")))
            .andExpect(status().isAccepted());

        org.assertj.core.api.Assertions.assertThat(importJobWorker.runOnce()).isTrue();

        mockMvc.perform(get("/api/v1/retailer/overview")
                .param("period", "ALL_TIME")
                .param("retailerCode", "PRIVATE")
                .with(httpBasic("test-retailer", "test-retailer-password")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.retailerCode").value("SHARED"))
            .andExpect(jsonPath("$.totalBaskets").value(1))
            .andExpect(jsonPath("$.totalSales").value(1.0))
            .andExpect(jsonPath("$.averageBasketValue").value(1.0))
            .andExpect(jsonPath("$.topProducts[0].name").value("Local Product"))
            .andExpect(jsonPath("$.sync.state").value("COMPLETED"))
            .andExpect(jsonPath("$.sync.importedReceipts").value(1));
    }

    @Test
    void cciCannotReadRetailerPrivateDashboardAndRetailerCannotReadCciEndpoint() throws Exception {
        mockMvc.perform(get("/api/v1/retailer/overview")
                .with(httpBasic("test-cci", "test-cci-password")))
            .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/v1/analytics/overview")
                .param("retailerCode", "SHARED")
                .with(httpBasic("test-retailer", "test-retailer-password")))
            .andExpect(status().isForbidden());
    }

    private ScanAccount account(
        String username,
        String password,
        ScanAccount.Role role,
        Retailer retailer,
        ImportProfile profile
    ) {
        return accountRepository.save(new ScanAccount(
            username,
            passwordEncoder.encode(password),
            role,
            retailer,
            profile
        ));
    }

    private String previewId(String username, String password) throws Exception {
        String response = mockMvc.perform(multipart("/api/v1/imports/preview")
                .file(transactionFile())
                .with(httpBasic(username, password)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.readyForImport").value(true))
            .andExpect(jsonPath("$.receiptsDetected").value(1))
            .andExpect(jsonPath("$.productLines").value(1))
            .andExpect(jsonPath("$.reportedNetSales").value(1.0))
            .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.previewId");
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

    private MockMultipartFile changedTransactionFile() {
        String csv = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            STORE-01,R-1,2026-08-24T10:00:00,LOCAL-1,,Local Product,1,2.00,0.00,2.00
            """;
        return new MockMultipartFile(
            "file",
            "security-test.csv",
            "text/csv",
            csv.getBytes(StandardCharsets.UTF_8)
        );
    }

    private MockMultipartFile unknownFormatFile() {
        String csv = """
            store,receipt number,datetime,item,qty,price,discount,total
            STORE-01,R-1,2026-08-24T10:00:00,Local Product,1,1.00,0.00,1.00
            """;
        return new MockMultipartFile(
            "file",
            "unknown-format.csv",
            "text/csv",
            csv.getBytes(StandardCharsets.UTF_8)
        );
    }

    private MockMultipartFile onboardingSample(String storeId) {
        String csv = """
            store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total
            %s,R-1,2026-08-24T10:00:00,LOCAL-1,,Local Product,1,1.00,0.00,1.00
            """.formatted(storeId);
        return new MockMultipartFile(
            "file",
            "sample.csv",
            "text/csv",
            csv.getBytes(StandardCharsets.UTF_8)
        );
    }

    private String canonicalProfileJson() {
        return """
            {
              "name": "Daily sales export",
              "sourceSystem": "Retailer Excel",
              "delimiter": ",",
              "dateTimePattern": "yyyy-MM-dd'T'HH:mm:ss",
              "currency": "AZN",
              "columns": {
                "storeId": "store_id",
                "receiptId": "receipt_id",
                "timestamp": "transaction_timestamp",
                "productCode": "product_code",
                "barcode": "barcode",
                "productName": "product_name",
                "quantity": "quantity",
                "unitPrice": "unit_price",
                "discountAmount": "discount_amount",
                "lineTotal": "line_total"
              }
            }
            """;
    }
}
