#include "ListeFrigoWifi.h"

#include <WiFi.h>
#include "secrets.h"

namespace {

constexpr uint32_t CONNECTION_TIMEOUT_MS = 15000;
constexpr uint32_t DEBUG_RETRY_DELAY_MS = 10000;
constexpr uint32_t CONNECTED_STATUS_INTERVAL_MS = 30000;
constexpr uint32_t WAITING_STATUS_INTERVAL_MS = 10000;
constexpr uint32_t CONNECTING_STATUS_INTERVAL_MS = 1000;

const char *authModeName(wifi_auth_mode_t mode)
{
    switch (mode) {
    case WIFI_AUTH_OPEN: return "OPEN";
    case WIFI_AUTH_WEP: return "WEP";
    case WIFI_AUTH_WPA_PSK: return "WPA";
    case WIFI_AUTH_WPA2_PSK: return "WPA2";
    case WIFI_AUTH_WPA_WPA2_PSK: return "WPA/WPA2";
    case WIFI_AUTH_WPA3_PSK: return "WPA3";
    default: return "AUTRE";
    }
}

} // namespace

void ListeFrigoWifi::begin()
{
    Serial.println("WiFi: initialisation station");
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);
    WiFi.persistent(false);
    WiFi.onEvent(onWiFiEvent);
    retry_delay_ms = DEBUG_RETRY_DELAY_MS;
    startAttempt();
}

void ListeFrigoWifi::poll()
{
    const wl_status_t wifi_status = WiFi.status();
    const uint32_t now = millis();
    pollScan();

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
        } else if (now >= next_status_log_ms) {
            logAttemptStatus(wifi_status);
            next_status_log_ms = now + CONNECTING_STATUS_INTERVAL_MS;
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
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    attempt_started_ms = millis();
    state = CONNECTING;
    next_status_log_ms = 0;
}

void ListeFrigoWifi::handleConnected()
{
    state = CONNECTED;
    retry_delay_ms = DEBUG_RETRY_DELAY_MS;

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
    startScan();
    scheduleRetry();
}

void ListeFrigoWifi::scheduleRetry()
{
    state = WAITING_RETRY;
    next_retry_ms = millis() + retry_delay_ms;
    next_status_log_ms = millis() + WAITING_STATUS_INTERVAL_MS;
    Serial.printf("WiFi: prochaine tentative dans %lu ms\n", static_cast<unsigned long>(retry_delay_ms));
    retry_delay_ms = DEBUG_RETRY_DELAY_MS;
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

void ListeFrigoWifi::logAttemptStatus(wl_status_t status)
{
    Serial.printf("WiFi status=%d RSSI=%d SSID=%s\n", static_cast<int>(status), WiFi.RSSI(), WiFi.SSID().c_str());
}

void ListeFrigoWifi::startScan()
{
    if (scan_in_progress) {
        return;
    }
    WiFi.scanDelete();
    const int16_t result = WiFi.scanNetworks(true, true);
    if (result == WIFI_SCAN_RUNNING) {
        scan_in_progress = true;
        Serial.println("WiFi: scan demarre");
    } else {
        Serial.printf("WiFi: scan impossible code=%d\n", result);
    }
}

void ListeFrigoWifi::pollScan()
{
    if (!scan_in_progress) {
        return;
    }
    const int16_t count = WiFi.scanComplete();
    if (count == WIFI_SCAN_RUNNING) {
        return;
    }
    scan_in_progress = false;
    if (count < 0) {
        Serial.printf("WiFi: scan echec code=%d\n", count);
        return;
    }

    bool configured_ssid_found = false;
    Serial.printf("WiFi: scan termine reseaux=%d\n", count);
    for (int16_t i = 0; i < count; ++i) {
        const String ssid = WiFi.SSID(i);
        const int32_t rssi = WiFi.RSSI(i);
        const int32_t channel = WiFi.channel(i);
        const wifi_auth_mode_t security = WiFi.encryptionType(i);
        Serial.printf("WiFi SCAN: SSID=\"%s\" RSSI=%ld dBm canal=%ld securite=%s%s\n",
                      ssid.c_str(), static_cast<long>(rssi), static_cast<long>(channel), authModeName(security),
                      ssid == WIFI_SSID ? " <-- configure" : "");
        configured_ssid_found = configured_ssid_found || ssid == WIFI_SSID;
    }
    if (!configured_ssid_found) {
        Serial.printf("WiFi SCAN: SSID configure \"%s\" introuvable (verifier le 2.4 GHz)\n", WIFI_SSID);
    }
    WiFi.scanDelete();
}

void ListeFrigoWifi::onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info)
{
    switch (event) {
    case ARDUINO_EVENT_WIFI_STA_START:
        Serial.println("WiFi EVENT: STA_START");
        break;
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
        Serial.println("WiFi EVENT: STA_CONNECTED");
        break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
        Serial.println("WiFi EVENT: STA_GOT_IP");
        break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
        Serial.printf("WiFi EVENT: STA_DISCONNECTED reason=%d\n", info.wifi_sta_disconnected.reason);
        break;
    default:
        break;
    }
}

bool ListeFrigoWifi::isConnected() const
{
    return state == CONNECTED && WiFi.status() == WL_CONNECTED;
}
