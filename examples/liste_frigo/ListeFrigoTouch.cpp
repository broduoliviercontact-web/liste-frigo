#include "ListeFrigoTouch.h"

namespace {
constexpr int16_t SCROLL_THRESHOLD_PX = 48;
}

bool ListeFrigoTouch::begin()
{
    Wire.begin(BOARD_SDA, BOARD_SCL);

    // Wake the GT911 if it was left asleep by a previous firmware.
    pinMode(TOUCH_INT, OUTPUT);
    digitalWrite(TOUCH_INT, HIGH);
    delay(20);

    uint8_t touch_address = 0;
    Wire.beginTransmission(0x14);
    if (Wire.endTransmission() == 0) {
        touch_address = 0x14;
    }
    Wire.beginTransmission(0x5D);
    if (Wire.endTransmission() == 0) {
        touch_address = 0x5D;
    }

    if (touch_address == 0) {
        Serial.println("Liste Frigo: erreur tactile GT911 introuvable");
        online = false;
        return false;
    }

    touch.setPins(-1, TOUCH_INT);
    if (!touch.begin(Wire, touch_address, BOARD_SDA, BOARD_SCL)) {
        Serial.println("Liste Frigo: erreur tactile GT911 init");
        online = false;
        return false;
    }

    touch.setMaxCoordinates(EPD_WIDTH, EPD_HEIGHT);
    touch.setSwapXY(true);
    touch.setMirrorXY(false, true);

    online = true;
    Serial.printf("Liste Frigo: tactile GT911 pret adresse 0x%02X\n", touch_address);
    return true;
}

bool ListeFrigoTouch::poll(TouchEvent &event)
{
    if (!online || millis() < next_poll_ms) {
        return false;
    }
    next_poll_ms = millis() + 20;

    int16_t physical_x = 0;
    int16_t physical_y = 0;
    const uint8_t touched = touch.getPoint(&physical_x, &physical_y, 1);

    if (!touched) {
        const bool should_emit_event = tracking && !emitted;
        const int16_t delta_y = last_logical_y - start_logical_y;
        tracking = false;
        emitted = false;
        if (!should_emit_event) {
            return false;
        }

        event.physical_x = start_physical_x;
        event.physical_y = start_physical_y;
        event.logical_x = start_logical_x;
        event.logical_y = start_logical_y;
        event.logical_end_x = last_logical_x;
        event.logical_end_y = last_logical_y;
        event.delta_y = delta_y;
        // A vertical drag released before the 20 ms polling tick is still a scroll.
        event.kind = delta_y <= -SCROLL_THRESHOLD_PX ? TOUCH_SWIPE_UP :
                     delta_y >= SCROLL_THRESHOLD_PX ? TOUCH_SWIPE_DOWN : TOUCH_TAP;
        event.tab = event.kind == TOUCH_TAP ? detectNavTab(start_logical_x, start_logical_y) : TAB_NONE;
        return true;
    }

    int16_t logical_x = 0;
    int16_t logical_y = 0;
    physicalToLogical(physical_x, physical_y, logical_x, logical_y);

    if (!tracking) {
        tracking = true;
        emitted = false;
        start_ms = millis();
        start_physical_x = physical_x;
        start_physical_y = physical_y;
        start_logical_x = logical_x;
        start_logical_y = logical_y;
    }

    last_logical_x = logical_x;
    last_logical_y = logical_y;

    if (emitted) {
        return false;
    }

    const int16_t delta_y = last_logical_y - start_logical_y;
    TouchKind kind = TOUCH_TAP;
    bool ready = false;

    if (delta_y <= -SCROLL_THRESHOLD_PX) {
        kind = TOUCH_SWIPE_UP;
        ready = true;
    } else if (delta_y >= SCROLL_THRESHOLD_PX) {
        kind = TOUCH_SWIPE_DOWN;
        ready = true;
    } else if (millis() - start_ms >= 280) {
        kind = TOUCH_TAP;
        ready = true;
    }

    if (!ready) {
        return false;
    }

    emitted = true;
    event.physical_x = start_physical_x;
    event.physical_y = start_physical_y;
    event.logical_x = start_logical_x;
    event.logical_y = start_logical_y;
    event.logical_end_x = last_logical_x;
    event.logical_end_y = last_logical_y;
    event.delta_y = delta_y;
    event.kind = kind;
    event.tab = (kind == TOUCH_TAP) ? detectNavTab(start_logical_x, start_logical_y) : TAB_NONE;
    if (kind != TOUCH_TAP) {
        tracking = false;
    }
    return true;
}

void ListeFrigoTouch::physicalToLogical(int16_t physical_x, int16_t physical_y, int16_t &logical_x, int16_t &logical_y)
{
    logical_x = physical_y;
    logical_y = EPD_WIDTH - 1 - physical_x;
}

NavTabId ListeFrigoTouch::detectNavTab(int16_t logical_x, int16_t logical_y)
{
    if (logical_x < 0 || logical_x >= LOGICAL_WIDTH || logical_y < 802 || logical_y >= 918) {
        return TAB_NONE;
    }

    int32_t index = logical_x / (LOGICAL_WIDTH / NAV_TAB_COUNT);
    if (index < 0) {
        index = 0;
    } else if (index >= NAV_TAB_COUNT) {
        index = NAV_TAB_COUNT - 1;
    }

    return static_cast<NavTabId>(index);
}
