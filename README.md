import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.util.ArrayList;
import java.util.List;

public class CreateRegionFunction {

    public void execute(FunctionContext functionContext) {
        try {
            // GFSH command to create a region
            String command = "create region --name=regionA --type=PARTITION";

            // List to hold the commands to be executed
            List<String> commands = new ArrayList<>();
            commands.add("gfsh");
            commands.add("-e");
            commands.add("connect --locator=localhost[10334]");
            commands.add("-e");
            commands.add(command);

            // Build and start the process
            ProcessBuilder processBuilder = new ProcessBuilder(commands);
            Process process = processBuilder.start();

            // Read the output from the command
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String line;
            StringBuilder output = new StringBuilder();
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
            reader.close();

            // Log the output
            System.out.println("Command execution result: " + output.toString());

            // Send the result back to the function context
            functionContext.getResultSender().lastResult("Region creation result: " + output.toString());

        } catch (Exception e) {
            e.printStackTrace();
            functionContext.getResultSender().sendException(e);
        }
    }
}
