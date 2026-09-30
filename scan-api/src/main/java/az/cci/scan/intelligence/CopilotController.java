package az.cci.scan.intelligence;

import az.cci.scan.config.TenantAccessService;
import az.cci.scan.domain.Retailer;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;

import static az.cci.scan.intelligence.CopilotDtos.AskRequest;
import static az.cci.scan.intelligence.CopilotDtos.ContextType;
import static az.cci.scan.intelligence.CopilotDtos.CopilotAnswer;

/**
 * The "Ask SCAN" / Copilot surface - context-aware, not a blank chat box. The caller always
 * states what it's asking about (a product, an open investigation, or nothing specific), and the
 * question text itself is not parsed by a model; the context alone selects which real analytics
 * tool runs. See CopilotService for why.
 */
@RestController
@RequestMapping("/api/v1/copilot")
public class CopilotController {

    private final CopilotService copilotService;
    private final TenantAccessService tenantAccess;

    public CopilotController(CopilotService copilotService, TenantAccessService tenantAccess) {
        this.copilotService = copilotService;
        this.tenantAccess = tenantAccess;
    }

    @PostMapping("/ask")
    public CopilotAnswer ask(
        @RequestParam String retailerCode,
        @Valid @RequestBody AskRequest request,
        Authentication authentication
    ) {
        Retailer retailer = tenantAccess.cciRetailer(authentication, retailerCode);
        ContextType contextType = ContextType.valueOf(request.contextType().toUpperCase(Locale.ROOT));
        return copilotService.answer(
            retailer, contextType, request.subjectName(), request.investigationId(), request.periodDays()
        );
    }
}
