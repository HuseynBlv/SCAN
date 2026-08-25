package az.cci.scan.importing;

public record ImportPersistenceResult(
    int importedReceipts,
    int importedLines,
    int duplicateReceipts,
    int unresolvedProducts
) {
}
