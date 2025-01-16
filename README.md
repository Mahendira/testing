#include "valkey.h"
#include <string.h>
int add_user_and_set_password_on_load(VKModuleCtx *ctx) {
    const char *username = "default_user";
    const char *password = "secure_password";
    if (VK_UserExists(ctx, username)) {
        if (VK_SetUserPassword(ctx, username, password) != VK_OK) {
            VK_Log(ctx, "ERROR: Failed to update password for existing user '%s'", username);
            return VK_ERR;
        }
        VK_Log(ctx, "INFO: Password updated for existing user '%s'", username);
    } else {
        
        if (VK_AddUser(ctx, username, password) != VK_OK) {
            VK_Log(ctx, "ERROR: Failed to add user '%s'", username);
            return VK_ERR;
        }
        VK_Log(ctx, "INFO: User '%s' added with password", username);
    }

    return VK_OK;
}


int VK_MODULE_INIT_FUNC(VKModuleCtx *ctx) {
    if (add_user_and_set_password_on_load(ctx) != VK_OK) {
        return VK_ERR;
    }

    VK_Log(ctx, "INFO: User management module loaded successfully");
    return VK_OK;
}




