package az.cci.scan.connector;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ScanApiClientTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void sendsAuthenticatedMultipartFileToTheConnectorEndpoint() throws Exception {
        AtomicReference<String> authorization = new AtomicReference<>();
        AtomicReference<String> contentType = new AtomicReference<>();
        AtomicReference<String> requestBody = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/api/v1/connector/imports", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            contentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = "{\"status\":\"COMPLETED\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(201, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        try {
            Path file = Files.writeString(temporaryDirectory.resolve("export.csv"), "receipt_id\nR-1\n");
            ScanApiClient client = new ScanApiClient(
                HttpClient.newHttpClient(),
                URI.create("http://localhost:" + server.getAddress().getPort() + "/api/v1/connector/imports"),
                "connector-user",
                "connector-secret",
                Duration.ofSeconds(10)
            );

            ImportClient.UploadResult result = client.upload(file);

            assertEquals(201, result.statusCode());
            assertEquals(
                "Basic " + Base64.getEncoder().encodeToString(
                    "connector-user:connector-secret".getBytes(StandardCharsets.UTF_8)
                ),
                authorization.get()
            );
            assertTrue(contentType.get().startsWith("multipart/form-data; boundary=scan-"));
            assertTrue(requestBody.get().contains("filename=\"export.csv\""));
            assertTrue(requestBody.get().contains("receipt_id\nR-1"));
        } finally {
            server.stop(0);
        }
    }
}
