package az.cci.scan.intelligence;

import az.cci.scan.domain.CanonicalProduct;
import az.cci.scan.domain.ImportProfile;
import az.cci.scan.domain.Investigation;
import az.cci.scan.domain.InvestigationHypothesis;
import az.cci.scan.domain.Retailer;
import az.cci.scan.importing.ImportService;
import az.cci.scan.repository.CanonicalProductRepository;
import az.cci.scan.repository.ImportJobRepository;
import az.cci.scan.repository.ImportPreviewRepository;
import az.cci.scan.repository.ImportProfileRepository;
import az.cci.scan.repository.FieldTaskRepository;
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
 * Proves an investigation opened for a product is seeded from a real comparison, not a template:
 * a genuine, constructed stockout-shaped decline produces both honest hypotheses with real
 * evidence text, while a flat product produces none.
 */
@SpringBootTest
class InvestigationServiceTest {

    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final String STORE_A = "STORE-A";
    private static final String STORE_B = "STORE-B";
    private static final int PERIOD_DAYS = 14;

    @Autowired
    private ImportService importService;

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

        retailer = retailerRepository.save(new Retailer("INVEST", "Investigation Test Shop", "Asia/Baku", true));
        importProfileRepository.save(new ImportProfile(
            retailer, "CANONICAL", "synthetic-canonical-v1", "yyyy-MM-dd'T'HH:mm:ss", "Asia/Baku", "AZN"
        ));
        receiptCounter = 0;
    }

    @Test
    void seedsBothHonestHypothesesFromARealStockoutShapedDecline() {
        importDecliningSpriteFixture();

        Investigation investigation = investigationService.openForProduct(retailer, "Sprite 500ml", PERIOD_DAYS, "tester@example.com");

        assertThat(investigation.getSubjectType()).isEqualTo(Investigation.SubjectType.PRODUCT);
        assertThat(investigation.getSubjectName()).isEqualTo("Sprite 500ml");
        assertThat(investigation.getStatus()).isEqualTo(Investigation.Status.OPEN);
        assertThat(investigation.getTitle()).contains("50%");

        List<String> statements = investigation.getHypotheses().stream().map(InvestigationHypothesis::getStatement).toList();
        assertThat(statements).anyMatch(s -> s.toLowerCase().contains("availability"));
        assertThat(statements).anyMatch(s -> s.toLowerCase().contains("placement") || s.toLowerCase().contains("execution"));
        assertThat(investigation.getHypotheses()).allMatch(h -> h.getConfidence() == InvestigationHypothesis.Confidence.MEDIUM);
        assertThat(investigation.getHypotheses()).allMatch(h -> h.getStatus() == InvestigationHypothesis.Status.OPEN);

        assertThat(investigation.getNotes()).hasSize(1);
        assertThat(investigation.getNotes().get(0).isSystem()).isTrue();
        assertThat(investigation.getNotes().get(0).getBody()).contains("Sprite 500ml").contains("12").contains("6");
    }

    @Test
    void doesNotInventHypothesesForAFlatProduct() {
        List<LocalDate> priorDates = datesAgo(16, 21);
        List<LocalDate> recentDates = datesAgo(1, 6);
        StringBuilder csv = new StringBuilder(header());
        for (LocalDate date : priorDates) {
            csv.append(spriteRow(STORE_A, date.atTime(12, 0)));
        }
        for (LocalDate date : recentDates) {
            csv.append(spriteRow(STORE_A, date.atTime(12, 0)));
        }
        importCsv(csv.toString());

        Investigation investigation = investigationService.openForProduct(retailer, "Sprite 500ml", PERIOD_DAYS, "tester@example.com");

        assertThat(investigation.getHypotheses()).isEmpty();
        assertThat(investigation.getNotes()).hasSize(1);
    }

    @Test
    void notesAndHypothesesAndStatusTransitionsWorkOnAManualInvestigation() {
        Investigation investigation = investigationService.openGeneral(
            retailer, "Why is the north region soft?", "What changed in the north region?", "tester@example.com"
        );
        assertThat(investigation.getStatus()).isEqualTo(Investigation.Status.OPEN);

        investigation = investigationService.addNote(retailer, investigation.getId(), "sales.manager@cci.com", "Checked with the distributor, nothing unusual reported.");
        assertThat(investigation.getStatus()).isEqualTo(Investigation.Status.IN_PROGRESS);
        assertThat(investigation.getNotes()).anyMatch(n -> !n.isSystem() && n.getAuthorUsername().equals("sales.manager@cci.com"));

        investigation = investigationService.addHypothesis(
            retailer, investigation.getId(), "A new competitor promotion may be running nearby.",
            "Anecdotal report from the field team.", null, InvestigationHypothesis.Confidence.LOW
        );
        var hypothesisId = investigation.getHypotheses().get(0).getId();

        investigation = investigationService.setHypothesisStatus(retailer, investigation.getId(), hypothesisId, InvestigationHypothesis.Status.REJECTED);
        assertThat(investigation.getHypotheses().get(0).getStatus()).isEqualTo(InvestigationHypothesis.Status.REJECTED);

        investigation = investigationService.close(retailer, investigation.getId());
        assertThat(investigation.getStatus()).isEqualTo(Investigation.Status.CLOSED);
        assertThat(investigation.getClosedAt()).isNotNull();

        investigation = investigationService.reopen(retailer, investigation.getId());
        assertThat(investigation.getStatus()).isEqualTo(Investigation.Status.IN_PROGRESS);
        assertThat(investigation.getClosedAt()).isNull();
    }

    @Test
    void searchFiltersInvestigationsByTitleOrQuestionCaseInsensitively() {
        investigationService.openGeneral(retailer, "Why is the north region soft?", "What changed in the north region?", "tester@example.com");
        investigationService.openGeneral(retailer, "Distributor delay resolved", "Why were deliveries late?", "tester@example.com");

        assertThat(investigationService.list(retailer, false, "north region")).hasSize(1);
        assertThat(investigationService.list(retailer, false, "DISTRIBUTOR")).hasSize(1);
        assertThat(investigationService.list(retailer, false, "deliveries late")).hasSize(1);
        assertThat(investigationService.list(retailer, false, "no such thing")).isEmpty();
        assertThat(investigationService.list(retailer, false, null)).hasSize(2);
        assertThat(investigationService.list(retailer, false, "  ")).hasSize(2);
    }

    @Test
    void findsRealHistoricalCasesSeededByARealProductInvestigation() {
        importDecliningSpriteFixture();
        Investigation closedCase = investigationService.openForProduct(retailer, "Sprite 500ml", PERIOD_DAYS, "tester@example.com");
        investigationService.setHypothesisStatus(
            retailer, closedCase.getId(), closedCase.getHypotheses().get(0).getId(), InvestigationHypothesis.Status.CONFIRMED
        );
        investigationService.close(retailer, closedCase.getId());

        List<Investigation> history = investigationService.findHistoricalCases(retailer, Investigation.SubjectType.PRODUCT, "Sprite 500ml");

        assertThat(history).hasSize(1);
        assertThat(history.get(0).getId()).isEqualTo(closedCase.getId());
        assertThat(history.get(0).getStatus()).isEqualTo(Investigation.Status.CLOSED);
        assertThat(history.get(0).getHypotheses()).anyMatch(h -> h.getStatus() == InvestigationHypothesis.Status.CONFIRMED);
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
