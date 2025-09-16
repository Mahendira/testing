#include "redismodule.h"

static void AuthFilter(RedisModuleCommandFilterCtx *filter) {
    const char *cmd = RedisModule_CommandFilterArgGet(filter, 0);
    if (cmd && !strcasecmp(cmd, "AUTH")) {
        // Always reply OK and block Valkey’s built-in AUTH
        RedisModule_CommandFilterArgReplace(filter, 0, RedisModule_CreateString(NULL, "MYAUTH", 6));
    }
}

int RedisModule_OnLoad(RedisModuleCtx *ctx, RedisModuleString **argv, int argc) {
    if (RedisModule_Init(ctx, "authfilter", 1, REDISMODULE_APIVER_1) == REDISMODULE_ERR)
        return REDISMODULE_ERR;

    // Register command filter
    RedisModule_RegisterCommandFilter(ctx, AuthFilter, 0);

    return REDISMODULE_OK;
}
Use the Command Filter API in your module:

Client sends AUTH foobar.

Your filter intercepts it, swaps the command to MYAUTH foobar.

Valkey executes your module command, not the built-in AUTH.

You decide whether to ignore, log, or authenticate.

Clients can keep using AUTH.

Wrong passwords don’t trigger errors.

You don’t touch acl.c.

You fully control auth logic.
