#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Table for decoding Base64 */
static const unsigned char dtable[256] = {
    ['A']=0,['B']=1,['C']=2,['D']=3,['E']=4,['F']=5,['G']=6,['H']=7,
    ['I']=8,['J']=9,['K']=10,['L']=11,['M']=12,['N']=13,['O']=14,['P']=15,
    ['Q']=16,['R']=17,['S']=18,['T']=19,['U']=20,['V']=21,['W']=22,['X']=23,
    ['Y']=24,['Z']=25,
    ['a']=26,['b']=27,['c']=28,['d']=29,['e']=30,['f']=31,['g']=32,['h']=33,
    ['i']=34,['j']=35,['k']=36,['l']=37,['m']=38,['n']=39,['o']=40,['p']=41,
    ['q']=42,['r']=43,['s']=44,['t']=45,['u']=46,['v']=47,['w']=48,['x']=49,
    ['y']=50,['z']=51,
    ['0']=52,['1']=53,['2']=54,['3']=55,['4']=56,['5']=57,['6']=58,['7']=59,
    ['8']=60,['9']=61,['+']=62,['/']=63
};

/* Convert Base64URL → Base64 */
char *base64url_to_base64(const char *input) {
    size_t len = strlen(input);
    size_t pad = (4 - (len % 4)) % 4;

    char *out = malloc(len + pad + 1);
    if (!out) return NULL;

    for (size_t i = 0; i < len; i++) {
        if (input[i] == '-') out[i] = '+';
        else if (input[i] == '_') out[i] = '/';
        else out[i] = input[i];
    }

    for (size_t i = 0; i < pad; i++) {
        out[len + i] = '=';
    }

    out[len + pad] = '\0';
    return out;
}

/* Base64 decode */
unsigned char *base64_decode(const char *input, size_t *out_len) {
    size_t len = strlen(input);
    if (len % 4 != 0) return NULL;

    size_t padding = 0;
    if (len >= 1 && input[len - 1] == '=') padding++;
    if (len >= 2 && input[len - 2] == '=') padding++;

    size_t decoded_len = (len / 4) * 3 - padding;
    unsigned char *out = malloc(decoded_len + 1);
    if (!out) return NULL;

    size_t j = 0;
    for (size_t i = 0; i < len; i += 4) {
        unsigned int val = dtable[(unsigned char)input[i]] << 18 |
                           dtable[(unsigned char)input[i+1]] << 12 |
                           dtable[(unsigned char)input[i+2]] << 6 |
                           dtable[(unsigned char)input[i+3]];

        out[j++] = (val >> 16) & 0xFF;
        if (input[i+2] != '=') out[j++] = (val >> 8) & 0xFF;
        if (input[i+3] != '=') out[j++] = val & 0xFF;
    }

    out[decoded_len] = '\0';
    if (out_len) *out_len = decoded_len;
    return out;
}

/* Wrapper: Base64URL decode */
unsigned char *base64url_decode(const char *input, size_t *out_len) {
    char *b64 = base64url_to_base64(input);
    if (!b64) return NULL;

    unsigned char *decoded = base64_decode(b64, out_len);
    free(b64);
    return decoded;
}

/* Example usage */
int main() {
    const char *jwt_payload = "eyJzdWIiOiIxMjM0NTY3ODkwIn0"; // {"sub":"1234567890"}

    size_t out_len;
    unsigned char *decoded = base64url_decode(jwt_payload, &out_len);

    if (decoded) {
        printf("Decoded: %.*s\n", (int)out_len, decoded);
        free(decoded);
    } else {
        printf("Decode failed\n");
    }

    return 0;
}
