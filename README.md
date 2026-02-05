import io.lettuce.core.cluster.RedisClusterClient;
import io.lettuce.core.cluster.api.StatefulRedisClusterConnection;
import io.lettuce.core.cluster.api.sync.RedisAdvancedClusterCommands;

public class ClusterConnect {

    public static void main(String[] args) {

        RedisClusterClient client =
            RedisClusterClient.create("redis://127.0.0.1:6379");

        StatefulRedisClusterConnection<String, String> connection =
            client.connect();

        RedisAdvancedClusterCommands<String, String> commands =
            connection.sync();

        commands.set("hello", "cluster");
        System.out.println(commands.get("hello"));

        connection.close();
        client.shutdown();
    }
}
