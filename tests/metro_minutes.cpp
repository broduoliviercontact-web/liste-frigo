#include <ArduinoJson.h>
#include <assert.h>
#include <stdio.h>

#include "../examples/liste_frigo/ListeFrigoMetro.h"

static int decode(const char *payload, uint8_t output[3])
{
    JsonDocument doc;
    assert(!deserializeJson(doc, payload));
    int count = 0;
    for (JsonVariant value : doc["pages"]["metro"]["lines"][0]["directions"][0]["minutes"].as<JsonArray>()) {
        uint8_t minutes = 0;
        if (count >= 3 || !decodeMetroMinute(value, minutes)) continue;
        output[count++] = minutes;
    }
    return count;
}

int main()
{
    assert(!metroSnapshotExpired(100, 45099));
    assert(metroSnapshotExpired(100, 45100));
    assert(metroSnapshotExpired(UINT32_MAX - 1000, 45000));

    uint8_t minutes[3] = {};
    const char *valid = R"({"pages":{"metro":{"lines":[{"directions":[{"minutes":[3,7,12]}]}]}}})";
    assert(decode(valid, minutes) == 3);
    assert(minutes[0] == 3 && minutes[1] == 7 && minutes[2] == 12);

    const char *invalid = R"({"pages":{"metro":{"lines":[{"directions":[{"minutes":["7 min","a quai",null,-1,181]}]}]}}})";
    assert(decode(invalid, minutes) == 0);
    puts("metro minute fixture: valid 3/7/12 preserved; invalid values rejected");
}
