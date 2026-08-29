package az.cci.scan.importing;

import az.cci.scan.domain.ImportJob;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

import static az.cci.scan.importing.ImportDtos.ImportJobResponse;

@RestController
@RequestMapping("/api/v1/imports")
public class ImportController {

    private final ImportService importService;

    public ImportController(ImportService importService) {
        this.importService = importService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ImportJobResponse> upload(
        @RequestParam String retailerCode,
        @RequestParam String profileCode,
        @RequestPart("file") MultipartFile file
    ) {
        ImportJobResponse response = importService.importFile(retailerCode, profileCode, file);
        return httpResponse(response);
    }

    static ResponseEntity<ImportJobResponse> httpResponse(ImportJobResponse response) {
        if (response.duplicateFile()) {
            return ResponseEntity.ok(response);
        }
        if (response.status() == ImportJob.Status.FAILED) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_CONTENT).body(response);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{jobId}")
    public ImportJobResponse get(@PathVariable UUID jobId) {
        return importService.getJob(jobId);
    }
}
