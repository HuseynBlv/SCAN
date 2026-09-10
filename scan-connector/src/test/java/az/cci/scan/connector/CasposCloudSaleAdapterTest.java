package az.cci.scan.connector;

import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CasposCloudSaleAdapterTest {

    private static final List<String> HEADERS = List.of(
        "Obyekt_kodu",
        "Kassa_kodu",
        "Çek_nömrəsi",
        "Çek_tarixi",
        "Sətir_nömrəsi",
        "Barkod",
        "Məhsul_kodu",
        "Məhsul_adı",
        "Kateqoriya",
        "Miqdar",
        "Vahid_qiyməti_AZN",
        "Sətir_endirimi_AZN",
        "Sətir_məbləği_AZN",
        "Çek_endirimi_AZN",
        "ƏDV_faizi",
        "Ödəniş_növü",
        "Çek_statusu",
        "Kassir_kodu"
    );

    @TempDir
    Path temporaryDirectory;

    @Test
    void convertsObservedWorkbookShapeAndRemovesUnneededSensitiveFields() throws Exception {
        Path source = workbook("completed.xlsx", "Tamamlanıb", 0);
        mutate(source, workbook -> workbook.getSheet("Satış çekləri").getRow(2).getCell(7)
            .setCellValue("Süd, \"tam\""));
        CasposCloudSaleAdapter adapter = new CasposCloudSaleAdapter(temporaryDirectory);

        try (SourceFileAdapter.PreparedUpload prepared = adapter.prepare(source)) {
            List<String> output = Files.readAllLines(prepared.uploadFile());

            assertEquals(3, output.size());
            assertEquals(
                "store_id,receipt_id,transaction_timestamp,product_code,barcode,product_name,quantity,unit_price,discount_amount,line_total",
                output.getFirst()
            );
            assertTrue(output.get(1).contains("\"KASSA-01:00018402\""));
            assertTrue(output.get(1).contains("\"2026-09-10T08:22:51\""));
            assertTrue(output.get(2).contains("\"Süd, \"\"tam\"\"\""));
            assertFalse(output.stream().anyMatch(line -> line.contains("KS-003") || line.contains("Kart")));
            assertEquals("1 receipt(s), 2 line(s), 4.04 AZN", prepared.preparationMessage());
        }

        assertTrue(Files.exists(source));
        assertEquals(1, Files.list(temporaryDirectory).count());
    }

    @Test
    void rejectsUnsupportedReceiptStatesWithoutUploadingPartialSales() throws Exception {
        Path source = workbook("return.xlsx", "Qaytarılıb", 0);
        CasposCloudSaleAdapter adapter = new CasposCloudSaleAdapter(temporaryDirectory);

        SourceFileValidationException exception = assertThrows(
            SourceFileValidationException.class,
            () -> adapter.validate(source)
        );

        assertTrue(exception.getMessage().contains("unsupported Çek_statusu"));
    }

    @Test
    void rejectsReceiptDiscountsUntilAllocationIsConfirmed() throws Exception {
        Path source = workbook("receipt-discount.xlsx", "Tamamlanıb", 0.50);
        CasposCloudSaleAdapter adapter = new CasposCloudSaleAdapter(temporaryDirectory);

        SourceFileValidationException exception = assertThrows(
            SourceFileValidationException.class,
            () -> adapter.validate(source)
        );

        assertTrue(exception.getMessage().contains("receipt-level discount allocation is not defined"));
    }

    @Test
    void validatorReportsCountsWithoutRequiringConnectorCredentials() throws Exception {
        Path source = workbook("validate.xlsx", "Tamamlanıb", 0);

        CasposCloudSaleAdapter.ConversionSummary summary = new CasposCloudSaleAdapter(temporaryDirectory)
            .validate(source);

        assertEquals(1, summary.receipts());
        assertEquals(2, summary.lines());
        assertEquals("4.04", summary.salesTotal().toPlainString());
    }

    @Test
    void normalizesOffsetTimestampsToThePilotTimeZone() throws Exception {
        Path source = workbook("offset.xlsx", "Tamamlanıb", 0);
        mutate(source, workbook -> {
            workbook.getSheet("Satış çekləri").getRow(1).getCell(3).setCellValue("2026-09-10T04:22:51Z");
            workbook.getSheet("Satış çekləri").getRow(2).getCell(3).setCellValue("2026-09-10T04:22:51Z");
        });

        try (SourceFileAdapter.PreparedUpload prepared = new CasposCloudSaleAdapter(temporaryDirectory)
            .prepare(source)) {
            assertTrue(Files.readString(prepared.uploadFile()).contains("\"2026-09-10T08:22:51\""));
        }
    }

    @Test
    void rejectsSchemaDriftBeforeConversion() throws Exception {
        Path wrongSheet = temporaryDirectory.resolve("wrong-sheet.xlsx");
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            workbook.createSheet("Sales");
            try (var output = Files.newOutputStream(wrongSheet)) {
                workbook.write(output);
            }
        }
        CasposCloudSaleAdapter adapter = new CasposCloudSaleAdapter(temporaryDirectory);
        assertTrue(assertThrows(SourceFileValidationException.class, () -> adapter.validate(wrongSheet))
            .getMessage().contains("was not found"));

        Path missingHeader = workbook("missing-header.xlsx", "Tamamlanıb", 0);
        mutate(missingHeader, workbook -> workbook.getSheet("Satış çekləri").getRow(0).getCell(12).setBlank());
        assertTrue(assertThrows(SourceFileValidationException.class, () -> adapter.validate(missingHeader))
            .getMessage().contains("Sətir_məbləği_AZN"));
    }

    @Test
    void rejectsDuplicateAndNonContiguousReceiptLines() throws Exception {
        CasposCloudSaleAdapter adapter = new CasposCloudSaleAdapter(temporaryDirectory);
        Path duplicate = workbook("duplicate.xlsx", "Tamamlanıb", 0);
        mutate(duplicate, workbook -> workbook.getSheet("Satış çekləri").getRow(2).getCell(4).setCellValue(1));
        assertTrue(assertThrows(SourceFileValidationException.class, () -> adapter.validate(duplicate))
            .getMessage().contains("duplicate Sətir_nömrəsi"));

        Path gap = workbook("gap.xlsx", "Tamamlanıb", 0);
        mutate(gap, workbook -> workbook.getSheet("Satış çekləri").getRow(2).getCell(4).setCellValue(3));
        assertTrue(assertThrows(SourceFileValidationException.class, () -> adapter.validate(gap))
            .getMessage().contains("must be contiguous from 1"));
    }

    @Test
    void rejectsInconsistentReceiptTimestampsAndEmptyTransactionSheets() throws Exception {
        CasposCloudSaleAdapter adapter = new CasposCloudSaleAdapter(temporaryDirectory);
        Path inconsistent = workbook("inconsistent-time.xlsx", "Tamamlanıb", 0);
        mutate(inconsistent, workbook -> workbook.getSheet("Satış çekləri").getRow(2).getCell(3)
            .setCellValue("2026-09-10T08:22:52"));
        assertTrue(assertThrows(SourceFileValidationException.class, () -> adapter.validate(inconsistent))
            .getMessage().contains("inconsistent Çek_tarixi"));

        Path empty = workbook("empty.xlsx", "Tamamlanıb", 0);
        mutate(empty, workbook -> {
            var sheet = workbook.getSheet("Satış çekləri");
            sheet.removeRow(sheet.getRow(1));
            sheet.removeRow(sheet.getRow(2));
        });
        assertTrue(assertThrows(SourceFileValidationException.class, () -> adapter.validate(empty))
            .getMessage().contains("contains no data rows"));
    }

    @Test
    void rejectsInvalidSaleArithmeticAndNonExcelInputs() throws Exception {
        CasposCloudSaleAdapter adapter = new CasposCloudSaleAdapter(temporaryDirectory);
        Path mismatch = workbook("mismatch.xlsx", "Tamamlanıb", 0);
        mutate(mismatch, workbook -> workbook.getSheet("Satış çekləri").getRow(1).getCell(12).setCellFormula("99"));
        assertTrue(assertThrows(SourceFileValidationException.class, () -> adapter.validate(mismatch))
            .getMessage().contains("does not equal ROUND"));

        Path zeroQuantity = workbook("zero-quantity.xlsx", "Tamamlanıb", 0);
        mutate(zeroQuantity, workbook -> workbook.getSheet("Satış çekləri").getRow(1).getCell(9)
            .setCellValue(0));
        assertTrue(assertThrows(SourceFileValidationException.class, () -> adapter.validate(zeroQuantity))
            .getMessage().contains("Miqdar must be greater than zero"));

        Path csv = Files.writeString(temporaryDirectory.resolve("export.csv"), "not an Excel workbook");
        assertTrue(assertThrows(SourceFileValidationException.class, () -> adapter.validate(csv))
            .getMessage().contains("only .xls or .xlsx"));
    }

    private Path workbook(String filename, String status, double receiptDiscount) throws Exception {
        Path path = temporaryDirectory.resolve(filename);
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            var sheet = workbook.createSheet("Satış çekləri");
            var header = sheet.createRow(0);
            for (int index = 0; index < HEADERS.size(); index++) {
                header.createCell(index).setCellValue(HEADERS.get(index));
            }
            addLine(sheet.createRow(1), 1, "BAK-00007", "Çörək", 1.15, status, receiptDiscount);
            addLine(sheet.createRow(2), 2, "DAI-00031", "Süd", 2.89, status, receiptDiscount);
            try (var output = Files.newOutputStream(path)) {
                workbook.write(output);
            }
        }
        return path;
    }

    private void addLine(
        org.apache.poi.ss.usermodel.Row row,
        int lineNumber,
        String productCode,
        String productName,
        double price,
        String status,
        double receiptDiscount
    ) {
        row.createCell(0).setCellValue("BK-0147");
        row.createCell(1).setCellValue("KASSA-01");
        row.createCell(2).setCellValue("00018402");
        var timestamp = row.createCell(3);
        timestamp.setCellValue(LocalDateTime.of(2026, 9, 10, 8, 22, 51));
        timestamp.setCellStyle(row.getSheet().getWorkbook().createCellStyle());
        timestamp.getCellStyle().setDataFormat(
            row.getSheet().getWorkbook().createDataFormat().getFormat("yyyy-mm-dd\\Thh:mm:ss")
        );
        row.createCell(4).setCellValue(lineNumber);
        row.createCell(5).setBlank();
        row.createCell(6).setCellValue(productCode);
        row.createCell(7).setCellValue(productName);
        row.createCell(8).setCellValue("Test");
        row.createCell(9).setCellValue(1);
        row.createCell(10).setCellValue(price);
        row.createCell(11).setCellValue(0);
        row.createCell(12).setCellFormula("ROUND(J" + (row.getRowNum() + 1) + "*K" + (row.getRowNum() + 1)
            + "-L" + (row.getRowNum() + 1) + ",2)");
        row.createCell(13).setCellValue(receiptDiscount);
        row.createCell(14).setCellValue(18);
        row.createCell(15).setCellValue("Kart");
        row.createCell(16).setCellValue(status);
        row.createCell(17).setCellValue("KS-003");
    }

    private void mutate(Path path, Consumer<XSSFWorkbook> mutation) throws Exception {
        XSSFWorkbook workbook;
        try (var input = Files.newInputStream(path)) {
            workbook = new XSSFWorkbook(input);
        }
        try (workbook; var output = Files.newOutputStream(path)) {
            mutation.accept(workbook);
            workbook.write(output);
        }
    }
}
