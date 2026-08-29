package az.cci.scan.importing;

import az.cci.scan.config.PilotAccessProperties;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import static az.cci.scan.importing.ImportDtos.ImportJobResponse;

@RestController
@RequestMapping("/api/v1/connector")
public class ConnectorImportController {

    private final ImportService importService;
    private final PilotAccessProperties pilotAccess;

    public ConnectorImportController(
        ImportService importService,
        PilotAccessProperties pilotAccess
    ) {
        this.importService = importService;
        this.pilotAccess = pilotAccess;
    }

    @PostMapping(path = "/imports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ImportJobResponse> upload(@RequestPart("file") MultipartFile file) {
        ImportJobResponse response = importService.importFile(
            pilotAccess.retailerCode(),
            pilotAccess.profileCode(),
            file
        );
        return ImportController.httpResponse(response);
    }
}
