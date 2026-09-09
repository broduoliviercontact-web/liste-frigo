#pragma once

#include <Arduino.h>

class ListeFrigoOta {
public:
    void poll(bool wifi_connected);

private:
    bool started = false;

    void begin();
};
