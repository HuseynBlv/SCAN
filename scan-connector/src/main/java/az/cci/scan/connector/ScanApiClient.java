package az.cci.scan.connector;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;

final class ScanApiClient implements ImportClient {

    private static final String CRLF = "\r\n";

    private final HttpClient httpClient;
    private final URI importUri;
    private final String authorization;
    private final Duration requestTimeout;

    ScanApiClient(ConnectorConfig config) {
        this(
            HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(20))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build(),
            config.apiBaseUrl().resolve("/api/v1/connector/imports"),
            config.username(),
            config.password(),
            config.requestTimeout()
        );
    }

    ScanApiClient(
        HttpClient httpClient,
        URI importUri,
        String username,
        String password,
        Duration requestTimeout
    ) {
        this.httpClient = httpClient;
        this.importUri = importUri;
        this.authorization = "Basic " + Base64.getEncoder().encodeToString(
            (username + ":" + password).getBytes(StandardCharsets.UTF_8)
        );
        this.requestTimeout = requestTimeout;
    }

    @Override
    public UploadResult upload(Path file) throws IOException, InterruptedException {
        String boundary = "scan-" + UUID.randomUUID();
        String filename = file.getFileName().toString().replace("\"", "_");
        byte[] prefix = (
            "--" + boundary + CRLF
                + "Content-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"" + CRLF
                + "Content-Type: application/octet-stream" + CRLF + CRLF
        ).getBytes(StandardCharsets.UTF_8);
        byte[] suffix = (CRLF + "--" + boundary + "--" + CRLF).getBytes(StandardCharsets.UTF_8);

        HttpRequest request = HttpRequest.newBuilder(importUri)
            .timeout(requestTimeout)
            .header("Authorization", authorization)
            .header("Accept", "application/json")
            .header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.concat(
                HttpRequest.BodyPublishers.ofByteArray(prefix),
                HttpRequest.BodyPublishers.ofInputStream(() -> inputStream(file)),
                HttpRequest.BodyPublishers.ofByteArray(suffix)
            ))
            .build();

        HttpResponse<String> response = httpClient.send(
            request,
            HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
        );
        return new UploadResult(response.statusCode(), response.body());
    }

    private static java.io.InputStream inputStream(Path file) {
        try {
            return Files.newInputStream(file);
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to open " + file.getFileName(), exception);
        }
    }
}
