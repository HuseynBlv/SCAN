package az.cci.scan.connector;

public final class ConnectorApplication {

    private ConnectorApplication() {
    }

    public static void main(String[] args) {
        try {
            if (java.util.Arrays.asList(args).contains("--help")) {
                usage();
                return;
            }
            java.nio.file.Path validationFile = validationPath(args);
            if (validationFile != null) {
                validateCaspos(validationFile);
                return;
            }
            ConnectorConfig config = ConnectorConfig.fromSources(System.getenv(), configPath(args));
            InboxProcessor processor = new InboxProcessor(config, new ScanApiClient(config));
            processor.initialize();

            boolean once = java.util.Arrays.asList(args).contains("--once");
            System.out.println("SCAN Retailer Connector");
            System.out.println("Inbox: " + config.inboxDirectory());
            System.out.println("API: " + config.apiBaseUrl());
            System.out.println("Source format: " + config.sourceFormat());
            if (once) {
                print(processor.processOnce());
                return;
            }

            System.out.println("Watching every " + config.pollInterval().toSeconds() + " seconds. Press Ctrl+C to stop.");
            while (!Thread.currentThread().isInterrupted()) {
                print(processor.processOnce());
                Thread.sleep(config.pollInterval());
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        } catch (Exception exception) {
            System.err.println("Connector stopped: " + exception.getMessage());
            System.exit(1);
        }
    }

    private static void usage() {
        System.out.println("SCAN Retailer Connector");
        System.out.println("  Continuous: java -jar scan-connector.jar --config connector.properties");
        System.out.println("  One cycle:  java -jar scan-connector.jar --config connector.properties --once");
        System.out.println("  CASPOS validation (offline, no credentials):");
        System.out.println("              java -jar scan-connector.jar --validate-caspos export.xlsx");
    }

    private static java.nio.file.Path validationPath(String[] args) {
        for (int index = 0; index < args.length; index++) {
            if (args[index].startsWith("--validate-caspos=")) {
                return java.nio.file.Path.of(args[index].substring("--validate-caspos=".length()));
            }
            if (args[index].equals("--validate-caspos")) {
                if (index + 1 >= args.length) {
                    throw new IllegalArgumentException("--validate-caspos requires a file path");
                }
                return java.nio.file.Path.of(args[index + 1]);
            }
        }
        return null;
    }

    private static void validateCaspos(java.nio.file.Path file) throws Exception {
        java.nio.file.Path absolute = file.toAbsolutePath().normalize();
        if (!java.nio.file.Files.isRegularFile(absolute)) {
            throw new IllegalArgumentException("Workbook does not exist: " + absolute);
        }
        CasposCloudSaleAdapter.ConversionSummary summary = new CasposCloudSaleAdapter(
            absolute.getParent()
        ).validate(absolute);
        System.out.println("Provisional CASPOS CloudSale workbook validation passed");
        System.out.println("File: " + absolute.getFileName());
        System.out.println("Summary: " + summary.message());
        System.out.println("No data was uploaded or changed.");
    }

    private static java.nio.file.Path configPath(String[] args) {
        for (int index = 0; index < args.length; index++) {
            if (args[index].startsWith("--config=")) {
                return java.nio.file.Path.of(args[index].substring("--config=".length()));
            }
            if (args[index].equals("--config")) {
                if (index + 1 >= args.length) {
                    throw new IllegalArgumentException("--config requires a file path");
                }
                return java.nio.file.Path.of(args[index + 1]);
            }
        }
        return null;
    }

    private static void print(InboxProcessor.ProcessingSummary summary) {
        if (summary.uploaded() > 0 || summary.failed() > 0) {
            System.out.printf(
                "Cycle complete: %d discovered, %d uploaded, %d failed, %d deferred%n",
                summary.discovered(),
                summary.uploaded(),
                summary.failed(),
                summary.deferred()
            );
        }
    }
}
