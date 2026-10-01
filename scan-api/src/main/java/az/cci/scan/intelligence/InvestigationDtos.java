package az.cci.scan.intelligence;

import az.cci.scan.domain.Investigation;
import az.cci.scan.domain.InvestigationHypothesis;
import az.cci.scan.domain.InvestigationNote;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class InvestigationDtos {

    private InvestigationDtos() {
    }

    record InvestigationResponse(
        UUID id,
        String title,
        String question,
        Investigation.SubjectType subjectType,
        String subjectName,
        int periodDays,
        Investigation.Status status,
        String ownerLabel,
        String createdBy,
        Instant createdAt,
        Instant updatedAt,
        Instant closedAt,
        List<HypothesisResponse> hypotheses,
        List<NoteResponse> notes
    ) {
        static InvestigationResponse from(Investigation investigation) {
            return new InvestigationResponse(
                investigation.getId(),
                investigation.getTitle(),
                investigation.getQuestion(),
                investigation.getSubjectType(),
                investigation.getSubjectName(),
                investigation.getPeriodDays(),
                investigation.getStatus(),
                investigation.getOwnerLabel(),
                investigation.getCreatedBy(),
                investigation.getCreatedAt(),
                investigation.getUpdatedAt(),
                investigation.getClosedAt(),
                investigation.getHypotheses().stream().map(HypothesisResponse::from).toList(),
                investigation.getNotes().stream().map(NoteResponse::from).toList()
            );
        }
    }

    record HypothesisResponse(
        UUID id,
        String statement,
        String supportingEvidence,
        String contradictingEvidence,
        InvestigationHypothesis.Confidence confidence,
        InvestigationHypothesis.Status status,
        Instant createdAt
    ) {
        static HypothesisResponse from(InvestigationHypothesis hypothesis) {
            return new HypothesisResponse(
                hypothesis.getId(),
                hypothesis.getStatement(),
                hypothesis.getSupportingEvidence(),
                hypothesis.getContradictingEvidence(),
                hypothesis.getConfidence(),
                hypothesis.getStatus(),
                hypothesis.getCreatedAt()
            );
        }
    }

    record NoteResponse(UUID id, String authorUsername, String body, boolean system, Instant createdAt) {
        static NoteResponse from(InvestigationNote note) {
            return new NoteResponse(note.getId(), note.getAuthorUsername(), note.getBody(), note.isSystem(), note.getCreatedAt());
        }
    }

    record OpenProductInvestigationRequest(@NotBlank String productName, Integer periodDays) {
    }

    record OpenGeneralInvestigationRequest(@NotBlank String title, @NotBlank String question) {
    }

    record AddNoteRequest(@NotBlank String body) {
    }

    record AddHypothesisRequest(
        @NotBlank String statement,
        @NotBlank String supportingEvidence,
        String contradictingEvidence,
        @NotBlank String confidence
    ) {
    }
}
