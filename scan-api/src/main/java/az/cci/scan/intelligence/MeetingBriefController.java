package az.cci.scan.intelligence;

import az.cci.scan.config.TenantAccessService;
import az.cci.scan.domain.Retailer;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static az.cci.scan.intelligence.MeetingBriefDtos.MeetingBriefResponse;

/**
 * "Prepare Weekly Sales Review" and the other meeting templates - a real, computed summary, not a
 * document. Exporting this to PPT/PDF is out of scope for this prototype; see MeetingBriefService.
 */
@RestController
@RequestMapping("/api/v1/meeting-briefs")
public class MeetingBriefController {

    private static final int DEFAULT_PERIOD_DAYS = 7;

    private final MeetingBriefService meetingBriefService;
    private final TenantAccessService tenantAccess;

    public MeetingBriefController(MeetingBriefService meetingBriefService, TenantAccessService tenantAccess) {
        this.meetingBriefService = meetingBriefService;
        this.tenantAccess = tenantAccess;
    }

    @GetMapping
    public MeetingBriefResponse prepare(
        @RequestParam String retailerCode,
        @RequestParam(defaultValue = "WEEKLY_SALES_REVIEW") String template,
        @RequestParam(required = false) Integer periodDays,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        return meetingBriefService.prepare(retailer, template, periodDays == null ? DEFAULT_PERIOD_DAYS : periodDays);
    }
}
