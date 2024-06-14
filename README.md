import org.apache.geode.management.internal.cli.shell.Gfsh;
import org.apache.geode.management.internal.cli.result.CommandResult;
import org.apache.geode.management.internal.cli.util.CommandStringBuilder;
import org.apache.geode.management.internal.cli.util.ProcessCommand;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class GeodeCommandExecutor {

    private Gfsh gfsh;

    public GeodeCommandExecutor() {
        try {
            gfsh = Gfsh.getGfshInstance(false, null);
            gfsh.setEnvProperty("APP_RESULT_VIEWER", "false");
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public String executeCommand(String command) {
        try {
            List<String> commandList = new ArrayList<>();
            commandList.add(command);
            CommandResult result = ProcessCommand.run(commandList);
            return result.toString();
        } catch (Exception e) {
            e.printStackTrace();
            return "Command execution failed.";
        }
    }

    public static void main(String[] args) {
        GeodeCommandExecutor executor = new GeodeCommandExecutor();
        String command = "list members";
        String result = executor.executeCommand(command);
        System.out.println("Command Result: \n" + result);
    }
}
