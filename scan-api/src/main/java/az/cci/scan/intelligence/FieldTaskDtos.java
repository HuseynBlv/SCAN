package az.cci.scan.intelligence;

import az.cci.scan.domain.FieldTask;
import az.cci.scan.domain.FieldTaskStore;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class FieldTaskDtos {

    private FieldTaskDtos() {
    }

    record FieldTaskResponse(
        UUID id,
        UUID investigationId,
        String title,
        String reason,
        String assignedTo,
        Instant dueAt,
        FieldTask.Status status,
        String createdBy,
        Instant createdAt,
        Instant updatedAt,
        List<FieldTaskStoreResponse> stores
    ) {
        static FieldTaskResponse from(FieldTask task) {
            return new FieldTaskResponse(
                task.getId(),
                task.getInvestigation() == null ? null : task.getInvestigation().getId(),
                task.getTitle(),
                task.getReason(),
                task.getAssignedTo(),
                task.getDueAt(),
                task.getStatus(),
                task.getCreatedBy(),
                task.getCreatedAt(),
                task.getUpdatedAt(),
                task.getStores().stream().map(FieldTaskStoreResponse::from).toList()
            );
        }
    }

    record FieldTaskStoreResponse(
        UUID id,
        String externalStoreId,
        Boolean stockAvailable,
        Boolean visibleInCooler,
        Boolean correctPlacement,
        Boolean competitorPresent,
        String note,
        boolean completed,
        Instant completedAt
    ) {
        static FieldTaskStoreResponse from(FieldTaskStore store) {
            return new FieldTaskStoreResponse(
                store.getId(),
                store.getExternalStoreId(),
                store.getStockAvailable(),
                store.getVisibleInCooler(),
                store.getCorrectPlacement(),
                store.getCompetitorPresent(),
                store.getNote(),
                store.isCompleted(),
                store.getCompletedAt()
            );
        }
    }

    record CreateFieldTaskRequest(
        UUID investigationId,
        @NotBlank String title,
        @NotBlank String reason,
        @NotBlank String assignedTo,
        Instant dueAt,
        @NotEmpty List<String> storeIds
    ) {
    }

    record RecordResultRequest(
        boolean stockAvailable,
        boolean visibleInCooler,
        boolean correctPlacement,
        boolean competitorPresent,
        String note
    ) {
    }
}
