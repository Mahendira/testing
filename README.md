#include "redismodule.h"
#include <jwt.h>
#include <curl/curl.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

int ValidateTokenWithADFS(const char *token) {
    jwt_t *jwt = NULL;
    int ret = jwt_decode(&jwt, token, NULL, 0);
    if (ret != 0) {
        return 0; // Invalid JWT
    }

    // Optionally: Use ADFS introspection endpoint for further validation
    CURL *curl = curl_easy_init();
    if (!curl) {
        jwt_free(jwt);
        return 0; // Failed to initialize CURL
    }

    const char *adfs_url = "https://your-adfs-server/adfs/oauth2/token/introspection";
    const char *adfs_client_id = "your-client-id";
    const char *adfs_client_secret = "your-client-secret";

    char post_fields[1024];
    snprintf(post_fields, sizeof(post_fields), "token=%s", token);

    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers, "Content-Type: application/x-www-form-urlencoded");

    curl_easy_setopt(curl, CURLOPT_URL, adfs_url);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, post_fields);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

    long response_code;
    curl_easy_perform(curl);
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &response_code);

    curl_easy_cleanup(curl);
    jwt_free(jwt);

    return response_code == 200; // Return true if token is valid
}

Intercept commands and enforce token validation.
int AuthenticatedCommand(RedisModuleCtx *ctx, RedisModuleString **argv, int argc) {
    if (argc < 2) {
        return RedisModule_ReplyWithError(ctx, "ERR token required");
    }

    const char *token = RedisModule_StringPtrLen(argv[1], NULL);

    if (!ValidateTokenWithADFS(token)) {
        return RedisModule_ReplyWithError(ctx, "ERR invalid token");
    }

    // Token is valid; forward the command
    return RedisModule_CallReplyToRedisReply(ctx, RedisModule_Call(ctx, "PING", ""));
}

Module Initialization

int RedisModule_OnLoad(RedisModuleCtx *ctx, RedisModuleString **argv, int argc) {
    if (RedisModule_Init(ctx, "authmodule", 1, REDISMODULE_APIVER_1) == REDISMODULE_ERR) {
        return REDISMODULE_ERR;
    }

    if (RedisModule_CreateCommand(ctx, "auth.ping", AuthenticatedCommand, "write", 1, 1, 1) == REDISMODULE_ERR) {
        return REDISMODULE_ERR;
    }

    return REDISMODULE_OK;
}


===
gcc -fPIC -shared -o authmodule.so authmodule.c -I/usr/include/hiredis -ljwt -lcurl





