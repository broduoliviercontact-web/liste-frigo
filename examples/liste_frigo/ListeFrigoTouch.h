#pragma once

#include <TouchDrvGT911.hpp>
#include <Wire.h>
#include "ListeFrigoTypes.h"
#include "utilities.h"

class ListeFrigoTouch {
public:
    bool begin();
    bool poll(TouchEvent &event);

private:
    TouchDrvGT911 touch;
    bool online = false;
    bool tracking = false;
    bool emitted = false;
    uint32_t next_poll_ms = 0;
    uint32_t start_ms = 0;
    int16_t start_physical_x = 0;
    int16_t start_physical_y = 0;
    int16_t start_logical_x = 0;
    int16_t start_logical_y = 0;
    int16_t last_logical_x = 0;
    int16_t last_logical_y = 0;

    void physicalToLogical(int16_t physical_x, int16_t physical_y, int16_t &logical_x, int16_t &logical_y);
    NavTabId detectNavTab(int16_t logical_x, int16_t logical_y);
};
