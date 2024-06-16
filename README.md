 try {
            // JMX connection properties
            String jmxHost = "localhost";
            int jmxPort = 1099; // Default JMX port for Geode

            // Connect to the JMX service
            JMXServiceURL url = new JMXServiceURL("service:jmx:rmi:///jndi/rmi://" + jmxHost + ":" + jmxPort + "/jmxrmi");
            JMXConnector jmxc = JMXConnectorFactory.connect(url, null);
            MBeanServerConnection mbsc = jmxc.getMBeanServerConnection();

            // Create MemberMXBean for locator (replace locator1 with your actual locator name)
            ObjectName locatorObjectName = new ObjectName("GemFire:type=Member,member=locator1");
            MemberMXBean locatorMember = JMX.newMBeanProxy(mbsc, locatorObjectName, MemberMXBean.class);

            // Execute gfsh command via MemberMXBean
            String command = "create region --name=MyRegion --type=PARTITION";
            String commandResult = locatorMember.processCommand(command);

            // Print command result
            System.out.println("Command Result:\n" + commandResult);

            // Close JMX connection
            jmxc.close();

        } catch (Exception e) {
            e.printStackTrace();
        }
=============================

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
