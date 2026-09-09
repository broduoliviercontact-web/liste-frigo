#include "ListeFrigoOta.h"

#include <ArduinoOTA.h>
#include "secrets.h"

namespace {

constexpr char OTA_HOSTNAME[] = "supervie-epaper";

} // namespace

void ListeFrigoOta::poll(bool wifi_connected)
{
    if (!wifi_connected) {
        return;
    }

    if (!started) {
        begin();
    }

    ArduinoOTA.handle();
}

void ListeFrigoOta::begin()
{
    ArduinoOTA.setHostname(OTA_HOSTNAME);

#if defined(SUPERVIE_OTA_PASSWORD)
    ArduinoOTA.setPassword(SUPERVIE_OTA_PASSWORD);
#elif defined(SUPERVIE_ACCESS_CODE)
    // The shared code keeps the first OTA setup usable without another secret.
    ArduinoOTA.setPassword(SUPERVIE_ACCESS_CODE);
#else
#error "Define SUPERVIE_OTA_PASSWORD or SUPERVIE_ACCESS_CODE in secrets.h"
#endif

    ArduinoOTA.onStart([]() {
        Serial.println("OTA: mise a jour recue, ecran en pause");
    });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        static uint8_t last_percent = 255;
        const uint8_t percent = total == 0 ? 0 : static_cast<uint8_t>((progress * 100U) / total);
        if (percent != last_percent && percent % 10 == 0) {
            Serial.printf("OTA: %u%%\n", percent);
            last_percent = percent;
        }
    });
    ArduinoOTA.onEnd([]() {
        Serial.println("OTA: terminee, redemarrage");
    });
    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("OTA: erreur=%u\n", error);
    });
    ArduinoOTA.begin();
    started = true;

    Serial.printf("OTA: pret, hote=%s.local port=3232\n", OTA_HOSTNAME);
}
