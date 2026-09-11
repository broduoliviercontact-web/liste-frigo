#pragma once

#include <ArduinoJson.h>
#include <stdint.h>

// The e-paper contract carries transit delays as JSON numbers of minutes.
// ArduinoJson's as<int>() returns zero for some invalid strings; accepting that
// conversion would turn malformed data into the misleading "A QUAI" display.
inline bool decodeMetroMinute(JsonVariantConst value, uint8_t &minutes)
{
    if (!value.is<int>()) return false;
    const int parsed = value.as<int>();
    if (parsed < 0 || parsed > 180) return false;
    minutes = static_cast<uint8_t>(parsed);
    return true;
}

// Unsigned subtraction remains valid across the millis() rollover.
inline bool metroSnapshotExpired(uint32_t received, uint32_t now) {
    return static_cast<uint32_t>(now - received) >= 45000UL;
}
