package az.cci.scan.connector;

public final class ConnectorApplication {

    private ConnectorApplication() {
    }

    public static void main(String[] args) {
        try {
            ConnectorConfig config = ConnectorConfig.fromSources(System.getenv(), configPath(args));
            InboxProcessor processor = new InboxProcessor(config, new ScanApiClient(config));
            processor.initialize();

            boolean once = java.util.Arrays.asList(args).contains("--once");
            System.out.println("SCAN Retailer Connector");
            System.out.println("Inbox: " + config.inboxDirectory());
            System.out.println("API: " + config.apiBaseUrl());
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
