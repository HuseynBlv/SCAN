package az.cci.scan.tools.kaggle;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public final class KaggleDatasetPreparationCli {

    private KaggleDatasetPreparationCli() {
    }

    public static void main(String[] args) {
        Map<String, String> options = parseArguments(args);
        if (options.containsKey("help")) {
            usage();
            return;
        }

        Path input = Path.of(required(options, "input"));
        Path output = Path.of(required(options, "output"));
        int receiptLimit = Integer.parseInt(options.getOrDefault("receipt-limit", "10000"));

        var result = new KaggleDatasetPreparer().prepare(input, output, receiptLimit);
        System.out.printf(
            "Prepared %,d receipts and %,d lines; quarantined %,d receipts. Output: %s%n",
            result.selectedReceipts(),
            result.outputLines(),
            result.quarantinedReceipts(),
            output.toAbsolutePath()
        );
    }

    private static Map<String, String> parseArguments(String[] args) {
        Map<String, String> options = new LinkedHashMap<>();
        for (int index = 0; index < args.length; index++) {
            String argument = args[index];
            if (argument.equals("--help")) {
                options.put("help", "true");
                continue;
            }
            if (!argument.startsWith("--")) {
                throw new IllegalArgumentException("Unexpected argument: " + argument);
            }
            String withoutPrefix = argument.substring(2);
            int separator = withoutPrefix.indexOf('=');
            if (separator >= 0) {
                options.put(withoutPrefix.substring(0, separator), withoutPrefix.substring(separator + 1));
                continue;
            }
            if (index + 1 >= args.length || args[index + 1].startsWith("--")) {
                throw new IllegalArgumentException("Missing value for --" + withoutPrefix);
            }
            options.put(withoutPrefix, args[++index]);
        }
        return options;
    }

    private static String required(Map<String, String> options, String name) {
        String value = options.get(name);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing required --" + name + " argument");
        }
        return value;
    }

    private static void usage() {
        System.out.println("""
            Prepare the Kaggle supermarket dataset for SCAN.

            Required:
              --input=/path/to/supermarket-data.zip
              --output=/path/to/output-directory

            Optional:
              --receipt-limit=10000   Use 0 for all eligible receipts.
            """);
    }
}
