#include "ListeFrigoWifi.h"

#include <WiFi.h>
#include "secrets.h"

namespace {

constexpr uint32_t CONNECTION_TIMEOUT_MS = 15000;
constexpr uint32_t MAX_RETRY_DELAY_MS = 60000;
constexpr uint32_t CONNECTED_STATUS_INTERVAL_MS = 30000;
constexpr uint32_t WAITING_STATUS_INTERVAL_MS = 10000;

} // namespace

void ListeFrigoWifi::begin()
{
    Serial.println("WiFi: initialisation station");
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);
    WiFi.persistent(false);
    startAttempt();
}

void ListeFrigoWifi::poll()
{
    const wl_status_t wifi_status = WiFi.status();
    const uint32_t now = millis();

    if (state == CONNECTED) {
        if (wifi_status != WL_CONNECTED) {
            Serial.println("WiFi: connexion perdue");
            reported_lost = true;
            scheduleRetry();
            return;
        }
        logPeriodicStatus();
        return;
    }

    if (state == CONNECTING) {
        if (wifi_status == WL_CONNECTED) {
            handleConnected();
            return;
        }

        if (now - attempt_started_ms >= CONNECTION_TIMEOUT_MS) {
            handleFailure("delai depasse");
        }
        return;
    }

    if (state == WAITING_RETRY && now >= next_retry_ms) {
        startAttempt();
        return;
    }

    if (state == WAITING_RETRY && now >= next_status_log_ms) {
        Serial.printf("WiFi: attente reconnexion, prochaine tentative dans %lu ms\n",
                      static_cast<unsigned long>(next_retry_ms - now));
        next_status_log_ms = now + WAITING_STATUS_INTERVAL_MS;
    }
}

void ListeFrigoWifi::startAttempt()
{
    Serial.printf("WiFi: debut connexion SSID=\"%s\"\n", WIFI_SSID);
    WiFi.disconnect(false, false);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    attempt_started_ms = millis();
    state = CONNECTING;
    next_status_log_ms = 0;
}

void ListeFrigoWifi::handleConnected()
{
    state = CONNECTED;
    retry_delay_ms = 5000;

    if (reported_lost) {
        Serial.println("WiFi: connexion retablie");
        reported_lost = false;
    }

    Serial.println("WiFi: connexion reussie");
    logConnectionDetails();
    next_status_log_ms = millis() + CONNECTED_STATUS_INTERVAL_MS;
}

void ListeFrigoWifi::handleFailure(const char *reason)
{
    Serial.printf("WiFi: echec connexion (%s)\n", reason);
    WiFi.disconnect(false, false);
    scheduleRetry();
}

void ListeFrigoWifi::scheduleRetry()
{
    state = WAITING_RETRY;
    next_retry_ms = millis() + retry_delay_ms;
    next_status_log_ms = millis() + WAITING_STATUS_INTERVAL_MS;
    Serial.printf("WiFi: prochaine tentative dans %lu ms\n", static_cast<unsigned long>(retry_delay_ms));
    retry_delay_ms = min(retry_delay_ms * 2, MAX_RETRY_DELAY_MS);
}

void ListeFrigoWifi::logConnectionDetails()
{
    Serial.print("WiFi: IP locale ");
    Serial.println(WiFi.localIP());
    Serial.printf("WiFi: RSSI %d dBm\n", WiFi.RSSI());
}

void ListeFrigoWifi::logPeriodicStatus()
{
    if (millis() < next_status_log_ms) {
        return;
    }
    Serial.println("WiFi: connexion toujours active");
    logConnectionDetails();
    next_status_log_ms = millis() + CONNECTED_STATUS_INTERVAL_MS;
}

bool ListeFrigoWifi::isConnected() const
{
    return state == CONNECTED && WiFi.status() == WL_CONNECTED;
}
