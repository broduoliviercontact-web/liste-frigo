#pragma once
#include <stdint.h>
#include <string.h>
struct DurableAdd {
    char key[33] = {};
    char label[160] = {};
    int32_t list_id = 0;
    uint64_t created_at = 0;
    uint8_t attempts = 0;
    uint8_t blocked = 0; // 1=rejected, 2=uncertain, 3=expired
};
struct DurableAdds {
    uint32_t version = 1;
    uint8_t count = 0;
    DurableAdd entries[8] = {};
    bool append(const DurableAdd &entry) {
        if (count >= 8) return false;
        entries[count++] = entry; return true;
    }
    void remove(uint8_t index) {
        for (uint8_t i = index; i + 1 < count; ++i) entries[i] = entries[i + 1];
        if (count) entries[--count] = {};
    }
};
inline bool addExpired(uint64_t created, uint64_t now) {
    return now < created || now - created >= 24ULL * 60 * 60 * 1000;
}
