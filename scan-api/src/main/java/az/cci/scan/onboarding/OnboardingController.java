package az.cci.scan.onboarding;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

import static az.cci.scan.onboarding.OnboardingDtos.CreateImportProfileRequest;
import static az.cci.scan.onboarding.OnboardingDtos.CreateRetailerRequest;
import static az.cci.scan.onboarding.OnboardingDtos.CreateStoreRequest;
import static az.cci.scan.onboarding.OnboardingDtos.ImportProfileResponse;
import static az.cci.scan.onboarding.OnboardingDtos.IssuedCredentialsResponse;
import static az.cci.scan.onboarding.OnboardingDtos.OnboardingContextResponse;
import static az.cci.scan.onboarding.OnboardingDtos.RetailerOnboardingResponse;
import static az.cci.scan.onboarding.OnboardingDtos.SampleValidationResponse;
import static az.cci.scan.onboarding.OnboardingDtos.StoreResponse;
import static az.cci.scan.onboarding.OnboardingDtos.CredentialResponse;
import static az.cci.scan.onboarding.OnboardingDtos.RotatedCredentialResponse;

@RestController
@RequestMapping("/api/v1/onboarding")
public class OnboardingController {

    private final OnboardingService onboardingService;

    public OnboardingController(OnboardingService onboardingService) {
        this.onboardingService = onboardingService;
    }

    @GetMapping("/context")
    public OnboardingContextResponse context(Authentication authentication) {
        return new OnboardingContextResponse(authentication.getName());
    }

    @GetMapping("/retailers")
    public List<RetailerOnboardingResponse> retailers() {
        return onboardingService.retailers();
    }

    @PostMapping("/retailers")
    @ResponseStatus(HttpStatus.CREATED)
    public RetailerOnboardingResponse createRetailer(
        @Valid @RequestBody CreateRetailerRequest request
    ) {
        return onboardingService.createRetailer(request);
    }

    @PostMapping("/retailers/{retailerId}/stores")
    @ResponseStatus(HttpStatus.CREATED)
    public StoreResponse createStore(
        @PathVariable UUID retailerId,
        @Valid @RequestBody CreateStoreRequest request
    ) {
        return onboardingService.createStore(retailerId, request);
    }

    @PostMapping("/retailers/{retailerId}/import-formats")
    @ResponseStatus(HttpStatus.CREATED)
    public ImportProfileResponse createImportProfile(
        @PathVariable UUID retailerId,
        @Valid @RequestBody CreateImportProfileRequest request
    ) {
        return onboardingService.createProfile(retailerId, request);
    }

    @PostMapping(
        path = "/retailers/{retailerId}/import-formats/{profileId}/sample-validation",
        consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public SampleValidationResponse validateSample(
        @PathVariable UUID retailerId,
        @PathVariable UUID profileId,
        @RequestPart("file") MultipartFile file
    ) {
        return onboardingService.validateSample(retailerId, profileId, file);
    }

    @PostMapping("/retailers/{retailerId}/import-formats/{profileId}/credentials")
    public ResponseEntity<IssuedCredentialsResponse> issueCredentials(
        @PathVariable UUID retailerId,
        @PathVariable UUID profileId,
        Authentication authentication
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .cacheControl(CacheControl.noStore())
            .body(onboardingService.issueCredentials(retailerId, profileId, authentication));
    }

    @GetMapping("/retailers/{retailerId}/credentials")
    public List<CredentialResponse> credentials(@PathVariable UUID retailerId) {
        return onboardingService.credentials(retailerId);
    }

    @PostMapping("/retailers/{retailerId}/credentials/{accountId}/rotate")
    public ResponseEntity<RotatedCredentialResponse> rotateCredential(
        @PathVariable UUID retailerId,
        @PathVariable UUID accountId,
        Authentication authentication
    ) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(onboardingService.rotateCredential(retailerId, accountId, authentication));
    }

    @DeleteMapping("/retailers/{retailerId}/credentials/{accountId}")
    public CredentialResponse revokeCredential(
        @PathVariable UUID retailerId,
        @PathVariable UUID accountId,
        Authentication authentication
    ) {
        return onboardingService.revokeCredential(retailerId, accountId, authentication);
    }
}
