

#include "valkeymodule.h"

int GetClientIPCommand(ValkeyModuleCtx *ctx, ValkeyModuleString **argv, int argc) {
    REDISMODULE_NOT_USED(argv);
    REDISMODULE_NOT_USED(argc);

    uint64_t client_id = ValkeyModule_GetClientId(ctx);

    ValkeyModuleClientInfo ci;
    memset(&ci, 0, sizeof(ci));
    ci.version = VALKEYMODULE_CLIENTINFO_VERSION;

    if (ValkeyModule_GetClientInfoById(&ci, client_id) != VALKEYMODULE_OK) {
        return ValkeyModule_ReplyWithError(ctx, "ERR unable to fetch client info");
    }

    if (ci.addr[0] == '\0') {
        return ValkeyModule_ReplyWithNull(ctx);
    }

    /* ci.addr is "IP:port" */
    ValkeyModule_ReplyWithStringBuffer(ctx, ci.addr, strlen(ci.addr));
    return VALKEYMODULE_OK;
}
What you get

ci.addr → "192.168.1.25:53422"

This is the actual TCP peer as Valkey sees it

Inside a Valkey module command handler, you can retrieve the peer IP + port of the client that issued the command using:

ValkeyModule_GetClientInfoById()

This is the official, supported API for modules.

High-level flow

Get the client ID for the current command context

Fetch the client info struct

Read the IP address


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

