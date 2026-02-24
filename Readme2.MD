#include "valkeymodule.h"
#include <string.h>
#include <strings.h>

/* Global session table */
static ValkeyModuleDict *auth_sessions = NULL;

/* Prevent recursive rewrite when MYAUTH internally calls AUTH */
#if defined(__GNUC__) || defined(__clang__)
static __thread int tls_in_myauth = 0;
#else
static int tls_in_myauth = 0;
#endif


/* ===========================
   MYAUTH Command
   =========================== */
int MyAuthCommand(ValkeyModuleCtx *ctx,
                  ValkeyModuleString **argv,
                  int argc)
{
    uint64_t client_id = ValkeyModule_GetClientId(ctx);

    if (argc != 2 && argc != 3) {
        return ValkeyModule_WrongArity(ctx);
    }

    tls_in_myauth = 1;

    /* Call the real AUTH command */
    ValkeyModuleCallReply *reply = NULL;

    if (argc == 2) {
        reply = ValkeyModule_Call(ctx, "AUTH", "s", argv[1]);
    } else {
        reply = ValkeyModule_Call(ctx, "AUTH", "ss", argv[1], argv[2]);
    }

    tls_in_myauth = 0;

    if (!reply) {
        return ValkeyModule_ReplyWithError(ctx,
               "ERR internal AUTH call failed");
    }

    int type = ValkeyModule_CallReplyType(reply);

    if (type == VALKEYMODULE_REPLY_ERROR) {
        /* Authentication failed */
        ValkeyModule_DictDelC(auth_sessions,
                              &client_id,
                              sizeof(client_id),
                              NULL);

        size_t len = 0;
        const char *err =
            ValkeyModule_CallReplyStringPtr(reply, &len);

        ValkeyModule_Log(ctx, "notice",
            "AUTH FAIL client_id=%llu err=%.*s",
            (unsigned long long)client_id,
            (int)len, err ? err : "");

        ValkeyModule_ReplyWithCallReply(ctx, reply);
        ValkeyModule_FreeCallReply(reply);
        return VALKEYMODULE_OK;
    }

    /* Authentication success */
    ValkeyModule_DictSetC(auth_sessions,
                          &client_id,
                          sizeof(client_id),
                          (void*)1);

    ValkeyModule_Log(ctx, "notice",
        "AUTH SUCCESS client_id=%llu",
        (unsigned long long)client_id);

    ValkeyModule_ReplyWithCallReply(ctx, reply);
    ValkeyModule_FreeCallReply(reply);

    return VALKEYMODULE_OK;
}


/* ===========================
   AUTH Filter
   =========================== */
void AuthFilter(ValkeyModuleCommandFilterCtx *filter)
{
    if (tls_in_myauth)
        return;

    int argc =
        ValkeyModule_CommandFilterArgsCount(filter);

    if (argc <= 0)
        return;

    ValkeyModuleString *cmd =
        ValkeyModule_CommandFilterArgGet(filter, 0);

    if (!cmd)
        return;

    size_t len = 0;
    const char *cmdstr =
        ValkeyModule_StringPtrLen(cmd, &len);

    if (!cmdstr)
        return;

    /* If command is AUTH, rewrite to MYAUTH */
    if (len == 4 &&
        strncasecmp(cmdstr, "AUTH", 4) == 0)
    {
        ValkeyModuleCtx *ctx =
            ValkeyModule_CommandFilterGetContext(filter);

        if (!ctx)
            return;

        ValkeyModuleString *myauth =
            ValkeyModule_CreateString(ctx,
                                      "MYAUTH", 6);

        ValkeyModule_CommandFilterArgReplace(filter,
                                             0,
                                             myauth);
    }
}


/* ===========================
   OnLoad
   =========================== */
int ValkeyModule_OnLoad(ValkeyModuleCtx *ctx,
                        ValkeyModuleString **argv,
                        int argc)
{
    VALKEYMODULE_NOT_USED(argv);
    VALKEYMODULE_NOT_USED(argc);

    if (ValkeyModule_Init(ctx,
                          "authfilter",
                          1,
                          VALKEYMODULE_APIVER_1)
        == VALKEYMODULE_ERR)
    {
        return VALKEYMODULE_ERR;
    }

    auth_sessions = ValkeyModule_CreateDict(ctx);
    if (!auth_sessions)
        return VALKEYMODULE_ERR;

    if (ValkeyModule_CreateCommand(ctx,
                                   "MYAUTH",
                                   MyAuthCommand,
                                   "write fast",
                                   0,0,0)
        == VALKEYMODULE_ERR)
    {
        return VALKEYMODULE_ERR;
    }

    if (ValkeyModule_RegisterCommandFilter(ctx,
                                           AuthFilter,
                                           0)
        == NULL)
    {
        return VALKEYMODULE_ERR;
    }

    ValkeyModule_Log(ctx, "notice",
        "authfilter module loaded successfully");

    return VALKEYMODULE_OK;
}


/* ===========================
   OnUnload
   =========================== */
int ValkeyModule_OnUnload(ValkeyModuleCtx *ctx)
{
    if (auth_sessions) {
        ValkeyModule_FreeDict(ctx, auth_sessions);
        auth_sessions = NULL;
    }

    ValkeyModule_Log(ctx, "notice",
        "authfilter module unloaded");

    return VALKEYMODULE_OK;
}
