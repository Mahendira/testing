#include "valkeymodule.h"
#include <string.h>

/* Validate the token (custom logic) */
int isTokenValid(const char *token) {
    // Replace with your actual token validation logic
    return strcmp(token, "valid_token") == 0;
}

/* Create a module user with required permissions */
ValkeyModuleUser *getOrCreateModuleUser() {
    static ValkeyModuleUser *moduleUser = NULL;

    if (!moduleUser) {
        // Create a module user if it doesn't exist
        moduleUser = ValkeyModule_CreateModuleUser("module_user");
        ValkeyModule_SetModuleUserACL(moduleUser, "allcommands"); // Allow all commands
        ValkeyModule_SetModuleUserACL(moduleUser, "allkeys");     // Allow access to all keys
        ValkeyModule_SetModuleUserACL(moduleUser, "on");          // Activate the user
    }

    return moduleUser;
}

/* Command Filter: Intercepts and validates all commands */
int CommandFilter(ValkeyModuleCommandFilterCtx *filterCtx) {
    // Validate token for all commands
    int argc = ValkeyModule_CommandFilterCtxGetArgCount(filterCtx);
    if (argc < 1) {
        ValkeyModule_CommandFilterCtxSetError(filterCtx, "ERR Missing token");
        return VALKEYMODULE_OK;
    }

    // Assume the first argument is the token
    ValkeyModuleString *tokenArg = ValkeyModule_CommandFilterCtxGetArg(filterCtx, 0);
    const char *token = ValkeyModule_StringPtrLen(tokenArg, NULL);

    // Validate the token
    if (!isTokenValid(token)) {
        ValkeyModule_CommandFilterCtxSetError(filterCtx, "ERR Invalid token");
        return VALKEYMODULE_OK;
    }

    // Token is valid, dynamically authenticate the client with the module user
    ValkeyModuleUser *moduleUser = getOrCreateModuleUser();
    ValkeyModuleCtx *clientCtx = ValkeyModule_GetThreadSafeContext(NULL);
    if (ValkeyModule_AuthenticateClientWithUser(clientCtx, moduleUser, NULL, NULL, NULL) != VALKEYMODULE_OK) {
        ValkeyModule_ReplyWithError(clientCtx, "ERR Failed to authenticate client with module user");
        ValkeyModule_FreeThreadSafeContext(clientCtx);
        return VALKEYMODULE_OK;
    }

    ValkeyModule_FreeThreadSafeContext(clientCtx);

    // Allow the command to proceed after successful authentication
    return VALKEYMODULE_OK;
}

/* OnLoad: Register the command filter */
int ValkeyModule_OnLoad(ValkeyModuleCtx *ctx, ValkeyModuleString **argv, int argc) {
    // Initialize the module
    if (ValkeyModule_Init(ctx, "authmodule", 1, VALKEYMODULE_APIVER_1) == VALKEYMODULE_ERR) {
        return VALKEYMODULE_ERR;
    }

    // Register the global command filter
    if (ValkeyModule_RegisterCommandFilter(ctx, CommandFilter, VALKEYMODULE_CMDFILTER_NO_INJECT) == VALKEYMODULE_ERR) {
        return VALKEYMODULE_ERR;
    }

    return VALKEYMODULE_OK;
}

/* OnUnload: Cleanup logic */
int ValkeyModule_OnUnload(ValkeyModuleCtx *ctx) {
    VALKEYMODULE_NOT_USED(ctx);
    return VALKEYMODULE_OK;
}
