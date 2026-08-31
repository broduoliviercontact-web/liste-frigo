#pragma once

#include <Arduino.h>
#include <WiFi.h>

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
    bool scan_in_progress = false;

    void startAttempt();
    void handleConnected();
    void handleFailure(const char *reason);
    void scheduleRetry();
    void logConnectionDetails();
    void logPeriodicStatus();
    void logAttemptStatus(wl_status_t status);
    void startScan();
    void pollScan();
    static void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info);
};
