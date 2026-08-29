#pragma once

#include <Arduino.h>

class ListeFrigoWifi {
public:
    void begin();
    void poll();
    bool isConnected() const;

private:
    enum State {
        IDLE,
        CONNECTING,
        CONNECTED,
        WAITING_RETRY,
    };

    State state = IDLE;
    uint32_t attempt_started_ms = 0;
    uint32_t next_retry_ms = 0;
    uint32_t next_status_log_ms = 0;
    uint32_t retry_delay_ms = 5000;
    bool reported_lost = false;

    void startAttempt();
    void handleConnected();
    void handleFailure(const char *reason);
    void scheduleRetry();
    void logConnectionDetails();
    void logPeriodicStatus();
};
