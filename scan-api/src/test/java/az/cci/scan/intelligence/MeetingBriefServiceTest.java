package az.cci.scan.intelligence;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.FieldTask;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Investigation;
import az.cci.scan.domain.Retailer;
import az.cci.scan.importing.ImportService;
import az.cci.scan.intelligence.MeetingBriefDtos.MeetingBriefResponse;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves "Prepare Weekly Sales Review" is a real aggregation, not a canned document: an
 * investigation opened from a genuine decline, strengthened by a completed field check, shows up
 * in both the risks section and the field-execution section with its real numbers, and a closed
 * investigation shows up as a completed action.
 */
@SpringBootTest
class MeetingBriefServiceTest {

    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String STORE_A = "STORE-A";
    private static final String STORE_B = "STORE-B";
    private static final int PERIOD_DAYS = 14;

    @Autowired
    private ImportService importService;

    @Autowired
    private MeetingBriefService meetingBriefService;

    @Autowired
    private InvestigationService investigationService;

    @Autowired
    private FieldTaskService fieldTaskService;

    @Autowired
    private InvestigationRepository investigationRepository;

    @Autowired
    private FieldTaskRepository fieldTaskRepository;

    @Autowired
    private RetailerOfferActivationRepository activationRepository;

    @Autowired
    private OperationalAuditEventRepository auditEventRepository;

    @Autowired
    private ScanAccountRepository accountRepository;

    @Autowired
    private RetailerRepository retailerRepository;

    @Autowired
    private StoreRepository storeRepository;

    @Autowired
    private ImportProfileRepository importProfileRepository;

    @Autowired
    private ImportJobRepository importJobRepository;

    @Autowired
    private ImportPreviewRepository importPreviewRepository;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private RetailerProductRepository retailerProductRepository;

    @Autowired
    private CanonicalProductRepository canonicalProductRepository;

    private Retailer retailer;
    private int receiptCounter;

    @BeforeEach
    void setUp() {
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
        canonicalProductRepository.deleteAll();
        retailerRepository.deleteAll();

        canonicalProductRepository.save(new CanonicalProduct(
            "Sprite 500ml", "5449000015101", "CCI", "CCI", "Beverages", null, null, null, true
        ));

        retailer = retailerRepository.save(new Retailer("BRIEF", "Meeting Brief Test Shop", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(
            retailer, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
        receiptCounter = 0;
    }

    @Test
    void includesAFieldCheckedDeclineAndAClosedInvestigationInTheSameBrief() {
        importDecliningSpriteFixture();

        Investigation investigation = investigationService.openForProduct(retailer, "Sprite 500ml", PERIOD_DAYS, "sales.manager@cci.com");
        FieldTask task = fieldTaskService.create(
            retailer, investigation, "Check Sprite availability in Store A", "Basket presence dropped to zero",
            "Field Sales Team", null, List.of(STORE_A), "sales.manager@cci.com"
        );
        fieldTaskService.recordResult(retailer, task.getId(), STORE_A, false, true, true, false, "Shelf was empty");

        Investigation closedInvestigation = investigationService.openGeneral(
            retailer, "Distributor delay resolved", "Why were deliveries late?", "sales.manager@cci.com"
        );
        investigationService.close(retailer, closedInvestigation.getId());

        MeetingBriefResponse brief = meetingBriefService.prepare(retailer, "WEEKLY_SALES_REVIEW", PERIOD_DAYS);

        assertThat(brief.networkSummary()).contains("%");
        assertThat(brief.risks()).anyMatch(r -> r.contains("Sprite 500ml"));
        assertThat(brief.fieldExecution()).anyMatch(f -> f.contains("1 of 1 store(s) had an issue"));
        assertThat(brief.issuesRequiringDecision()).anyMatch(i -> i.contains(investigation.getTitle()));
        assertThat(brief.completedActions()).contains("Distributor delay resolved");
        assertThat(brief.limitations()).contains("does not yet track trade activations");
    }

    @Test
    void reportsHonestEmptyStateWithNoData() {
        MeetingBriefResponse brief = meetingBriefService.prepare(retailer, "WEEKLY_SALES_REVIEW", PERIOD_DAYS);

        assertThat(brief.issuesRequiringDecision()).isEmpty();
        assertThat(brief.completedActions()).isEmpty();
        assertThat(brief.risks()).isEmpty();
        assertThat(brief.fieldExecution()).containsExactly("No field checks were created or completed in this window.");
    }

    private void importDecliningSpriteFixture() {
        List<LocalDate> priorDates = datesAgo(16, 28);
        List<LocalDate> recentDates = datesAgo(1, 13);
        StringBuilder csv = new StringBuilder(header());

        for (int i = 0; i < 6; i++) {
            csv.append(spriteRow(STORE_A, priorDates.get(i).atTime(12, 0)));
            csv.append(spriteRow(STORE_B, priorDates.get(i).atTime(12, 0)));
        }
        for (int i = 6; i < 10; i++) {
            csv.append(fillerRow(STORE_A, priorDates.get(i).atTime(12, 0)));
            csv.append(fillerRow(STORE_B, priorDates.get(i).atTime(12, 0)));
        }
        for (int i = 0; i < 10; i++) {
            csv.append(fillerRow(STORE_A, recentDates.get(i).atTime(12, 0)));
        }
        for (int i = 0; i < 6; i++) {
            csv.append(spriteRow(STORE_B, recentDates.get(i).atTime(12, 0)));
        }
        for (int i = 6; i < 10; i++) {
            csv.append(fillerRow(STORE_B, recentDates.get(i).atTime(12, 0)));
        }
        importCsv(csv.toString());
    }

    private List<LocalDate> datesAgo(int startInclusive, int endInclusive) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        return java.util.stream.IntStream.rangeClosed(startInclusive, endInclusive)
            .mapToObj(today::minusDays)
            .toList();
    }

    private String header() {
        return "store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total\n";
    }

    private String spriteRow(String storeId, LocalDateTime timestamp) {
        receiptCounter++;
        return storeId + ",R-" + receiptCounter + "," + TIMESTAMP_FORMAT.format(timestamp)
            + ",SPRITE,5449000015101,Sprite 500ml,1,2.50,0.00,2.50\n";
    }

    private String fillerRow(String storeId, LocalDateTime timestamp) {
        receiptCounter++;
        return storeId + ",R-" + receiptCounter + "," + TIMESTAMP_FORMAT.format(timestamp)
            + ",WATER,0000000000000,Still Water 500ml,1,1.00,0.00,1.00\n";
    }

    private void importCsv(String csv) {
        importService.importFile(retailer.getCode(), "CANONICAL", new MockMultipartFile(
            "file", "fixture.csv", "text/csv", csv.getBytes()
        ));
    }
}
