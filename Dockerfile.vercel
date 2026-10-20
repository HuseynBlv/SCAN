FROM node:24-bookworm-slim AS frontend
WORKDIR /build/scan-app
COPY scan-app/package.json scan-app/package-lock.json ./
RUN npm ci
COPY scan-app/ ./
# The container always builds the current dashboard with same-origin API requests.
# Secrets are runtime-only; never declare database/password build arguments.
RUN VITE_ENABLE_LEGACY_SCANNER=false VITE_SCAN_API_BASE_URL= npm run build

FROM maven:3.9.11-eclipse-temurin-21 AS backend
WORKDIR /build/scan-api
COPY scan-api/pom.xml ./
RUN mvn --batch-mode --no-transfer-progress dependency:go-offline
COPY scan-api/src/ ./src/
COPY --from=frontend /build/scan-app/dist/ ./src/main/resources/static/
# Unit/integration tests run in CI before the container smoke test.
RUN mvn --batch-mode --no-transfer-progress -DskipTests package

FROM eclipse-temurin:21-jre-jammy AS runtime
WORKDIR /app
RUN groupadd --system scan && useradd --system --gid scan --home-dir /app --no-create-home scan
COPY --from=backend --chown=scan:scan /build/scan-api/target/scan-api-*.jar /app/scan.jar
ENV SPRING_PROFILES_ACTIVE=cloud \
    JAVA_TOOL_OPTIONS="-Xms64m -Xmx256m -XX:MaxMetaspaceSize=128m -XX:ReservedCodeCacheSize=48m -XX:MaxDirectMemorySize=32m -Xss512k -XX:ActiveProcessorCount=1 -XX:+ExitOnOutOfMemoryError"
USER scan
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/scan.jar"]
