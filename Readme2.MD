#include "valkeymodule.h"   // or redismodule.h depending on your build

static void log_auth_attempt(ValkeyModuleCtx *ctx,
                             const char *user,
                             size_t passlen,
                             const char *outcome,
                             const char *detail) {
    // You can add client info here (IP/port) if you already know how via client-info APIs.
    ValkeyModule_Log(ctx, "notice",
        "auth_audit user=%s passlen=%zu outcome=%s detail=%s",
        user ? user : "(default)", passlen, outcome, detail ? detail : "");
}

int MyAuthCommand(ValkeyModuleCtx *ctx, ValkeyModuleString **argv, int argc) {
    // MYAUTH [username] password  (same as AUTH)
    if (argc != 2 && argc != 3) {
        return ValkeyModule_WrongArity(ctx);
    }

    const char *user = NULL;
    size_t userlen = 0;
    size_t passlen = 0;

    ValkeyModuleString *pass = NULL;

    if (argc == 2) {
        pass = argv[1];
        // In AUTH 1-arg form, username is implicit (default user)
    } else {
        user = ValkeyModule_StringPtrLen(argv[1], &userlen);
        pass = argv[2];
    }

    (void)ValkeyModule_StringPtrLen(pass, &passlen);

    // Log the incoming attempt (DON'T log password)
    log_auth_attempt(ctx, user, passlen, "ATTEMPT", "");

    // Execute the real AUTH
    ValkeyModuleCallReply *r = NULL;
    if (argc == 2) {
        r = ValkeyModule_Call(ctx, "AUTH", "s", argv[1]);
    } else {
        r = ValkeyModule_Call(ctx, "AUTH", "ss", argv[1], argv[2]);
    }

    if (r == NULL) {
        log_auth_attempt(ctx, user, passlen, "ERROR", "ValkeyModule_Call returned NULL");
        return ValkeyModule_ReplyWithError(ctx, "ERR internal auth call failed");
    }

    // Inspect result and log outcome
    int t = ValkeyModule_CallReplyType(r);
    if (t == VALKEYMODULE_REPLY_ERROR) {
        size_t elen = 0;
        const char *estr = ValkeyModule_CallReplyStringPtr(r, &elen);
        // estr contains the error message (safe to log generally, but still be cautious)
        log_auth_attempt(ctx, user, passlen, "FAIL", estr ? estr : "ERR");
    } else {
        // OK, or other non-error replies
        log_auth_attempt(ctx, user, passlen, "OK", "");
    }

    // Return the original reply back to client verbatim
    ValkeyModule_ReplyWithCallReply(ctx, r);
    ValkeyModule_FreeCallReply(r);
    return VALKEYMODULE_OK;
}

int ValkeyModule_OnLoad(ValkeyModuleCtx *ctx, ValkeyModuleString **argv, int argc) {
    VALKEYMODULE_NOT_USED(argv);
    VALKEYMODULE_NOT_USED(argc);

    if (ValkeyModule_Init(ctx, "myauthmod", 1, VALKEYMODULE_APIVER_1) == VALKEYMODULE_ERR)
        return VALKEYMODULE_ERR;

    // IMPORTANT: allow unauthenticated clients to run MYAUTH
    // In practice, you want the "no-auth" command flag.
    if (ValkeyModule_CreateCommand(ctx, "myauth",
            MyAuthCommand,
            "no-auth fast",   // flags vary slightly by header; aim for no-auth + fast/@connection
            0, 0, 0) == VALKEYMODULE_ERR) {
        return VALKEYMODULE_ERR;
    }

    return VALKEYMODULE_OK;
}
