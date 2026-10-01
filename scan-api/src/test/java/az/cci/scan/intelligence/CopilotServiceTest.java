package az.cci.scan.intelligence;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Investigation;
import az.cci.scan.domain.InvestigationHypothesis;
import az.cci.scan.domain.Retailer;
import az.cci.scan.importing.ImportService;
import az.cci.scan.intelligence.CopilotDtos.ContextType;
import az.cci.scan.intelligence.CopilotDtos.CopilotAnswer;
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
 * Proves the Copilot answer is built from real tool calls, not free text: a product question
 * returns the same numbers ChangeDetectionService computes, an investigation question returns the
 * investigation's actual open hypotheses, and a question with no real context gets the honest
 * "cannot answer" fallback rather than an invented answer.
 */
@SpringBootTest
class CopilotServiceTest {

    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String STORE_A = "STORE-A";
    private static final String STORE_B = "STORE-B";
    private static final int PERIOD_DAYS = 14;

    @Autowired
    private ImportService importService;

    @Autowired
    private CopilotService copilotService;

    @Autowired
    private InvestigationService investigationService;

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

        retailer = retailerRepository.save(new Retailer("COPILOT", "Copilot Test Shop", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(
            retailer, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
        receiptCounter = 0;
    }

    @Test
    void answersAProductQuestionFromRealComparisonData() {
        importDecliningSpriteFixture();

        CopilotAnswer answer = copilotService.answer(retailer, ContextType.PRODUCT, "Sprite 500ml", null, PERIOD_DAYS);

        assertThat(answer.whatScanFound()).contains("Sprite 500ml").contains("12").contains("6");
        assertThat(answer.possibleExplanations()).isNotEmpty();
        assertThat(answer.possibleExplanations()).anyMatch(e -> e.toLowerCase().contains("availability"));
        assertThat(answer.evidence()).isNotEmpty();
        assertThat(answer.confidence()).isEqualTo("MEDIUM");
        assertThat(answer.whatWeStillDontKnow()).contains("no direct stock-level or competitor data");
        assertThat(answer.nextSteps()).anyMatch(step -> step.actionType().equals("CREATE_FIELD_CHECK"));
        assertThat(answer.priorCases()).isEmpty();
    }

    @Test
    void surfacesARealPastCaseForTheSameProductAsCommercialMemory() {
        importDecliningSpriteFixture();
        Investigation pastCase = investigationService.openForProduct(retailer, "Sprite 500ml", PERIOD_DAYS, "tester@example.com");
        investigationService.setHypothesisStatus(
            retailer, pastCase.getId(), pastCase.getHypotheses().get(0).getId(), InvestigationHypothesis.Status.CONFIRMED
        );
        investigationService.close(retailer, pastCase.getId());

        CopilotAnswer answer = copilotService.answer(retailer, ContextType.PRODUCT, "Sprite 500ml", null, PERIOD_DAYS);

        assertThat(answer.priorCases()).hasSize(1);
        assertThat(answer.priorCases().get(0)).contains("closed").contains("confirmed").contains("Availability issue");
    }

    @Test
    void answersAnInvestigationQuestionFromItsRealOpenHypotheses() {
        Investigation investigation = investigationService.openGeneral(
            retailer, "Why is the north region soft?", "What changed?", "tester@example.com"
        );
        investigation = investigationService.addHypothesis(
            retailer, investigation.getId(), "A distributor delivery issue may be affecting this region.",
            "Two stores reported partial deliveries last week.", null, InvestigationHypothesis.Confidence.LOW
        );

        CopilotAnswer answer = copilotService.answer(retailer, ContextType.INVESTIGATION, null, investigation.getId(), null);

        assertThat(answer.whatScanFound()).contains("Why is the north region soft?").contains("1 hypothesis");
        assertThat(answer.possibleExplanations()).anyMatch(e -> e.contains("distributor delivery issue"));
        assertThat(answer.confidence()).isEqualTo("LOW");
        assertThat(answer.nextSteps()).isNotEmpty();
    }

    @Test
    void refusesToGuessWhenThereIsNoRealContext() {
        CopilotAnswer answer = copilotService.answer(retailer, ContextType.GENERAL, null, null, null);

        assertThat(answer.whatScanFound()).isEqualTo("The current SCAN data cannot answer this reliably.");
        assertThat(answer.possibleExplanations()).isEmpty();
        assertThat(answer.evidence()).isEmpty();
        assertThat(answer.confidence()).isEqualTo("NONE");
    }

    @Test
    void refusesToGuessWhenProductContextHasNoSubject() {
        CopilotAnswer answer = copilotService.answer(retailer, ContextType.PRODUCT, null, null, PERIOD_DAYS);

        assertThat(answer.confidence()).isEqualTo("NONE");
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
