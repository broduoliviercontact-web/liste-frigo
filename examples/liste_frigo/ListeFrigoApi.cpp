#include "ListeFrigoApi.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "secrets.h"

namespace {

constexpr const char *EPAPER_STATE_URL = "https://liste-frigo.pliskain.chatgpt.site/api/epaper/v1/state";
constexpr const char *LISTS_API_URL = "https://liste-frigo.pliskain.chatgpt.site/api/lists";
constexpr uint32_t FIRST_FETCH_DELAY_MS = 3000;
constexpr uint32_t SUCCESS_FETCH_INTERVAL_MS = 15000;
constexpr uint32_t MAX_RETRY_DELAY_MS = 120000;
constexpr uint32_t HTTP_TIMEOUT_MS = 7000;
constexpr uint32_t WRITE_GAP_MS = 250;
constexpr uint32_t TOGGLE_RETRY_DELAYS_MS[] = {1000, 2000, 5000, 10000, 30000};

#if defined(EPAPER_BYPASS_TOKEN)
constexpr bool HAS_EPAPER_TOKEN = true;
#else
constexpr bool HAS_EPAPER_TOKEN = false;
#endif

void copyMessage(char *target, size_t target_size, const char *message)
{
    if (target_size == 0) {
        return;
    }
    strlcpy(target, message, target_size);
}

void copyEpaperText(char *target, size_t target_size, const char *source, const char *fallback)
{
    if (target_size == 0) {
        return;
    }
    if (!source || !*source) {
        strlcpy(target, fallback, target_size);
        return;
    }

    size_t out = 0;
    while (*source && out < target_size - 1) {
        const uint8_t first = static_cast<uint8_t>(*source++);
        if (first < 0x80) {
            target[out++] = static_cast<char>(first);
            continue;
        }

        const uint8_t second = static_cast<uint8_t>(*source);
        char replacement[3] = {0};
        if (first == 0xC3 && second != 0) {
            ++source;
            if (second >= 0x80 && second <= 0x85) strcpy(replacement, "A");
            else if (second == 0x87) strcpy(replacement, "c");
            else if (second >= 0x88 && second <= 0x8B) strcpy(replacement, "E");
            else if (second >= 0x8C && second <= 0x8F) strcpy(replacement, "I");
            else if (second == 0x91) strcpy(replacement, "N");
            else if (second >= 0x92 && second <= 0x96) strcpy(replacement, "O");
            else if (second >= 0x99 && second <= 0x9C) strcpy(replacement, "U");
            else if (second == 0x9D) strcpy(replacement, "Y");
            else if (second >= 0xA0 && second <= 0xA5) strcpy(replacement, "a");
            else if (second == 0xA7) strcpy(replacement, "c");
            else if (second >= 0xA8 && second <= 0xAB) strcpy(replacement, "e");
            else if (second >= 0xAC && second <= 0xAF) strcpy(replacement, "i");
            else if (second == 0xB1) strcpy(replacement, "n");
            else if (second >= 0xB2 && second <= 0xB6) strcpy(replacement, "o");
            else if (second >= 0xB9 && second <= 0xBC) strcpy(replacement, "u");
            else if (second == 0xBD || second == 0xBE) strcpy(replacement, "y");
        } else if (first == 0xC5 && second != 0) {
            ++source;
            if (second == 0x92) strcpy(replacement, "OE");
            else if (second == 0x93) strcpy(replacement, "oe");
        } else if (first == 0xE2 && static_cast<uint8_t>(source[0]) == 0x80 &&
                   static_cast<uint8_t>(source[1]) == 0x99) {
            source += 2;
            strcpy(replacement, "'");
        } else {
            // Skip unsupported UTF-8 glyphs, including emoji, rather than draw garbage.
            while ((*source & 0xC0) == 0x80) ++source;
        }

        for (size_t i = 0; replacement[i] && out < target_size - 1; ++i) {
            target[out++] = replacement[i];
        }
    }
    target[out] = 0;
    if (out == 0) strlcpy(target, fallback, target_size);
}

void copyLabel(char *target, const char *source)
{
    copyEpaperText(target, LIST_LABEL_MAX, source, "item");
}

void copyListName(char *target, const char *source)
{
    copyEpaperText(target, LIST_NAME_MAX, source, "Courses");
}

int8_t hourFromIso(const char *timestamp)
{
    if (!timestamp || strlen(timestamp) < 13 || timestamp[10] != 'T') {
        return -1;
    }
    const int hour = atoi(timestamp + 11);
    return hour >= 0 && hour < 24 ? hour : -1;
}

void fetchTask(void *param)
{
    auto *client = static_cast<ListeFrigoApi *>(param);
    static ListPageState fetched_list_cache[LIST_COUNT_MAX] = {};

    while (true) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        ListeFrigoApi::RequestKind kind = ListeFrigoApi::REQUEST_NONE;
        int32_t toggle_item_id = 0;
        bool toggle_checked = false;
        uint32_t toggle_generation = 0;
        int32_t selected_list_id = 0;
        char add_label[LIST_LABEL_MAX] = {0};
        client->snapshotRequest(kind, toggle_item_id, toggle_checked, toggle_generation, selected_list_id, add_label, sizeof(add_label));

        WiFiClientSecure secure_client;
        HTTPClient http;

        secure_client.setInsecure();
        http.setTimeout(HTTP_TIMEOUT_MS);
        http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

        int http_code = 0;
        String payload;
        bool success = false;
        char message[96] = {0};
        char active_tab[16] = {0};
        char generated_at[32] = {0};
        uint32_t list_count = 0;
        uint32_t item_count = 0;
        ListPageState *fetched_list_state = nullptr;
        int8_t fetched_list_cache_count = 0;
        bool has_list_state = false;
        WeatherState fetched_weather = {};
        bool has_weather_state = false;
        const bool is_write_request = kind == ListeFrigoApi::REQUEST_TOGGLE_ITEM ||
                                      kind == ListeFrigoApi::REQUEST_SELECT_LIST ||
                                      kind == ListeFrigoApi::REQUEST_ADD_ITEM;
        String state_url = EPAPER_STATE_URL;
        if (!is_write_request && selected_list_id > 0) {
            state_url += "?listId=";
            state_url += selected_list_id;
        }
        const char *url = is_write_request ? LISTS_API_URL : state_url.c_str();

        if (http.begin(secure_client, url)) {
            http.addHeader("Accept", "application/json");
#if defined(EPAPER_BYPASS_TOKEN)
            http.addHeader("OAI-Sites-Authorization", String("Bearer ") + EPAPER_BYPASS_TOKEN);
#endif
            if (is_write_request) {
                http.addHeader("Content-Type", "application/json");
                JsonDocument body;
                if (kind == ListeFrigoApi::REQUEST_TOGGLE_ITEM) {
                    body["action"] = "toggleItem";
                    body["id"] = toggle_item_id;
                    body["checked"] = toggle_checked;
                } else {
                    if (kind == ListeFrigoApi::REQUEST_SELECT_LIST) {
                        body["action"] = "selectList";
                        body["id"] = toggle_item_id;
                    } else {
                        body["action"] = "addItem";
                        body["listId"] = toggle_item_id;
                        body["label"] = add_label;
                    }
                }
                String request_body;
                serializeJson(body, request_body);
                http_code = http.POST(request_body);
            } else {
                http_code = http.GET();
            }
            payload = http.getString();

            if (is_write_request) {
                if (http_code == HTTP_CODE_OK) {
                    success = true;
                    if (kind == ListeFrigoApi::REQUEST_TOGGLE_ITEM) {
                        snprintf(message, sizeof(message), "toggle OK");
                    } else if (kind == ListeFrigoApi::REQUEST_SELECT_LIST) {
                        snprintf(message, sizeof(message), "select OK");
                    } else {
                        snprintf(message, sizeof(message), "add OK");
                    }
                } else {
                    snprintf(message, sizeof(message), "HTTP %d", http_code);
                }
            } else if (http_code == HTTP_CODE_OK) {
                JsonDocument doc;
                DeserializationError error = deserializeJson(doc, payload);
                if (error) {
                    snprintf(message, sizeof(message), "JSON invalide: %s", error.c_str());
                } else {
                    strlcpy(active_tab, doc["activeTab"] | "", sizeof(active_tab));
                    strlcpy(generated_at, doc["generatedAt"] | "", sizeof(generated_at));
                    JsonArray lists = doc["pages"]["listes"]["lists"].as<JsonArray>();
                    list_count = lists.size();
                    for (JsonObject list : lists) {
                        item_count += list["items"].as<JsonArray>().size();
                    }

                    memset(fetched_list_cache, 0, sizeof(fetched_list_cache));
                    ListSummary summaries[LIST_COUNT_MAX] = {};
                    int8_t copied_lists = 0;
                    for (JsonObject list : lists) {
                        if (copied_lists >= LIST_COUNT_MAX) {
                            break;
                        }
                        ListSummary &summary = summaries[copied_lists];
                        summary.id = list["id"] | 0;
                        copyListName(summary.name, list["name"] | "Liste");
                        summary.remaining_count = 0;
                        for (JsonObject item : list["items"].as<JsonArray>()) {
                            if (!(item["checked"] | false)) {
                                ++summary.remaining_count;
                            }
                        }
                        ++copied_lists;
                    }
                    for (JsonObject list : lists) {
                        if (fetched_list_cache_count >= copied_lists) {
                            break;
                        }
                        ListPageState &cached = fetched_list_cache[fetched_list_cache_count];
                        cached.id = list["id"] | 0;
                        copyListName(cached.name, list["name"] | "Courses");
                        memcpy(cached.lists, summaries, sizeof(ListSummary) * copied_lists);
                        cached.list_count = copied_lists;

                        int8_t copied_items = 0;
                        for (JsonObject item : list["items"].as<JsonArray>()) {
                            if (copied_items >= LIST_ITEM_COUNT) {
                                break;
                            }
                            cached.items[copied_items].id = item["id"] | 0;
                            copyLabel(cached.items[copied_items].label, item["label"] | "item");
                            cached.items[copied_items].checked = item["checked"] | false;
                            ++copied_items;
                        }
                        cached.item_count = copied_items;
                        cached.scroll_offset = 0;
                        if (cached.id == selected_list_id || fetched_list_state == nullptr) {
                            fetched_list_state = &cached;
                        }
                        ++fetched_list_cache_count;
                    }
                    has_list_state = fetched_list_state != nullptr;

                    JsonObject weather = doc["pages"]["meteo"].as<JsonObject>();
                    if (strcmp(weather["status"] | "", "ready") == 0) {
                        fetched_weather.available = true;
                        strlcpy(fetched_weather.location, weather["location"] | "Pantin", sizeof(fetched_weather.location));
                        strlcpy(fetched_weather.updated_at, weather["updatedAt"] | "", sizeof(fetched_weather.updated_at));
                        JsonObject current = weather["current"].as<JsonObject>();
                        fetched_weather.current_temperature = current["temperature"] | 0;
                        fetched_weather.current_weather_code = current["weatherCode"] | 3;
                        fetched_weather.current_is_day = current["isDay"] | true;
                        JsonObject today = weather["today"].as<JsonObject>();
                        fetched_weather.today_min = today["min"] | 0;
                        fetched_weather.today_max = today["max"] | 0;
                        fetched_weather.today_weather_code = today["weatherCode"] | 3;
                        JsonObject tomorrow = weather["tomorrow"].as<JsonObject>();
                        fetched_weather.tomorrow_min = tomorrow["min"] | 0;
                        fetched_weather.tomorrow_max = tomorrow["max"] | 0;
                        fetched_weather.tomorrow_weather_code = tomorrow["weatherCode"] | 3;
                        for (JsonObject hourly : weather["hourly"].as<JsonArray>()) {
                            if (fetched_weather.hourly_count >= WEATHER_HOUR_COUNT) break;
                            const int8_t hour = hourFromIso(hourly["time"] | "");
                            if (hour < 0) continue;
                            WeatherHour &target = fetched_weather.hourly[fetched_weather.hourly_count++];
                            target.hour = hour;
                            target.temperature = hourly["temperature"] | 0;
                            target.weather_code = hourly["weatherCode"] | 3;
                            target.is_day = hourly["isDay"] | true;
                        }
                        JsonObject creche = weather["creche"].as<JsonObject>();
                        JsonObject departure = creche["departure"].as<JsonObject>();
                        if (!departure.isNull()) {
                            fetched_weather.departure.available = true;
                            fetched_weather.departure.temperature = departure["temperature"] | 0;
                            fetched_weather.departure.weather_code = departure["weatherCode"] | 3;
                            fetched_weather.departure.is_day = departure["isDay"] | true;
                        }
                        JsonObject return_forecast = creche["return"].as<JsonObject>();
                        if (!return_forecast.isNull()) {
                            fetched_weather.return_forecast.available = true;
                            fetched_weather.return_forecast.temperature = return_forecast["temperature"] | 0;
                            fetched_weather.return_forecast.weather_code = return_forecast["weatherCode"] | 3;
                            fetched_weather.return_forecast.is_day = return_forecast["isDay"] | true;
                        }
                        has_weather_state = fetched_weather.hourly_count > 0;
                    }

                    success = true;
                    snprintf(message, sizeof(message), "JSON OK");
                }
            } else {
                snprintf(message, sizeof(message), "HTTP %d", http_code);
            }
            http.end();
        } else {
            copyMessage(message, sizeof(message), "HTTP begin impossible");
        }

        if (is_write_request) {
            client->finishToggle(success, http_code, payload.length(), message,
                                 kind, toggle_item_id, toggle_checked, toggle_generation);
        } else {
            client->finishFetch(success, http_code, payload.length(), message, active_tab, list_count, item_count,
                                has_list_state ? fetched_list_state : nullptr, fetched_list_cache,
                                fetched_list_cache_count, generated_at,
                                has_weather_state ? &fetched_weather : nullptr);
        }
    }
}

} // namespace

void ListeFrigoApi::begin()
{
    if (!HAS_EPAPER_TOKEN) {
        Serial.println("API: EPAPER_BYPASS_TOKEN absent dans secrets.h, client en attente");
        state = API_DISABLED;
        return;
    }

    BaseType_t created = xTaskCreatePinnedToCore(fetchTask, "epaper_api", 12288, this, 1, &task_handle, 0);
    if (created != pdPASS) {
        Serial.println("API: erreur creation tache HTTP au demarrage");
        state = API_DISABLED;
        return;
    }

    Serial.println("API: client e-paper pret");
    state = API_IDLE;
    next_fetch_ms = millis() + FIRST_FETCH_DELAY_MS;
}

void ListeFrigoApi::poll(bool wifi_connected)
{
    if (state == API_DISABLED) {
        return;
    }

    wifi_available = wifi_connected;
    if (!wifi_available && hasPendingToggles() && !offline_wait_logged) {
        Serial.println("API: WiFi indisponible, ecritures locales en attente");
        offline_wait_logged = true;
    }
    if (wifi_available) {
        offline_wait_logged = false;
    }

    if (toggle_result_ready) {
        consumeToggleResult();
    }

    if (result_ready) {
        consumeResult();
    }

    if (!wifi_available || state == API_FETCHING) {
        return;
    }

    startQueuedRequestIfAny();
    if (request_in_flight || result_ready || toggle_result_ready || !wifi_available) {
        return;
    }

    if (millis() < next_fetch_ms) {
        return;
    }

    startFetch();
}

void ListeFrigoApi::setSelectedListId(int32_t list_id)
{
    selected_list_id = list_id;
}

void ListeFrigoApi::requestStateRefresh()
{
    next_fetch_ms = 0;
}

bool ListeFrigoApi::takeListState(ListPageState &target)
{
    if (!list_state_available) {
        return false;
    }

    target = result_list_state;
    list_state_available = false;
    return true;
}

bool ListeFrigoApi::takeGeneratedAt(char *target, size_t target_size)
{
    if (!generated_at_available || target_size == 0) {
        return false;
    }
    strlcpy(target, result_generated_at, target_size);
    generated_at_available = false;
    return true;
}

bool ListeFrigoApi::takeWeatherState(WeatherState &target)
{
    if (!weather_state_available) return false;
    target = result_weather_state;
    weather_state_available = false;
    return true;
}

bool ListeFrigoApi::getCachedListState(int32_t list_id, ListPageState &target) const
{
    for (int8_t i = 0; i < cached_list_count; ++i) {
        if (cached_list_states[i].id == list_id) {
            target = cached_list_states[i];
            return true;
        }
    }
    return false;
}

bool ListeFrigoApi::sendToggleItem(int32_t item_id, bool checked)
{
    if (state == API_DISABLED || task_handle == nullptr || item_id <= 0) {
        Serial.println("API: toggle item non envoye, client indisponible ou id absent");
        return false;
    }

    PendingToggle *pending = findOrCreatePendingToggle(item_id);
    if (pending == nullptr) {
        Serial.println("API: file toggle pleine, ecriture ignoree");
        return false;
    }

    pending->desired_checked = checked;
    pending->dirty = true;
    pending->generation = ++next_toggle_generation;
    Serial.printf("API LOCAL: id=%ld desired=%s generation=%lu dirty=true%s\n",
                  static_cast<long>(item_id), checked ? "true" : "false",
                  static_cast<unsigned long>(pending->generation),
                  pending->in_flight ? " inFlight=true" : "");
    startQueuedRequestIfAny();
    return true;
}

bool ListeFrigoApi::sendSelectList(int32_t list_id)
{
    if (state == API_DISABLED || task_handle == nullptr || list_id <= 0) {
        Serial.println("API: select liste non envoye, client indisponible ou id absent");
        return false;
    }

    if (request_in_flight || result_ready || toggle_result_ready || !wifi_available) {
        queued_toggle_item_id = list_id;
        queued_toggle_checked = false;
        queued_request_kind = REQUEST_SELECT_LIST;
        Serial.printf("API: selection liste mise en attente id=%ld\n", static_cast<long>(list_id));
        return true;
    }

    toggle_item_id = list_id;
    toggle_checked = false;
    Serial.printf("API: POST select liste id=%ld\n", static_cast<long>(toggle_item_id));
    request_kind = REQUEST_SELECT_LIST;
    request_in_flight = true;
    toggle_result_ready = false;
    state = API_FETCHING;
    xTaskNotifyGive(task_handle);
    return true;
}

bool ListeFrigoApi::sendAddItem(int32_t list_id, const char *label)
{
    if (state == API_DISABLED || task_handle == nullptr || list_id <= 0 || label == nullptr || !*label) {
        Serial.println("API: ajout item non envoye, client indisponible ou donnees absentes");
        return false;
    }

    if (request_in_flight || result_ready || toggle_result_ready) {
        queued_toggle_item_id = list_id;
        queued_toggle_checked = false;
        strlcpy(queued_add_label, label, sizeof(queued_add_label));
        queued_request_kind = REQUEST_ADD_ITEM;
        Serial.printf("API: ajout mis en attente liste=%ld label=%s\n", static_cast<long>(list_id), queued_add_label);
        return true;
    }

    toggle_item_id = list_id;
    toggle_checked = false;
    strlcpy(add_label, label, sizeof(add_label));
    startAddItem();
    return true;
}

void ListeFrigoApi::snapshotRequest(RequestKind &kind, int32_t &item_id, bool &checked, uint32_t &generation, int32_t &selected_list,
                                    char *label, size_t label_size) const
{
    kind = request_kind;
    item_id = toggle_item_id;
    checked = toggle_checked;
    generation = toggle_generation;
    selected_list = selected_list_id;
    if (label && label_size > 0) {
        strlcpy(label, add_label, label_size);
    }
}

void ListeFrigoApi::finishFetch(bool success, int http_code, size_t bytes, const char *message,
                                const char *active_tab, uint32_t list_count, uint32_t item_count,
                                const ListPageState *list_state, const ListPageState *list_cache,
                                int8_t list_cache_count, const char *generated_at,
                                const WeatherState *weather_state)
{
    result_http_code = http_code;
    result_bytes = bytes;
    result_success = success;
    result_list_count = list_count;
    result_item_count = item_count;
    copyMessage(result_message, sizeof(result_message), message);
    copyMessage(result_active_tab, sizeof(result_active_tab), active_tab);
    copyMessage(result_generated_at, sizeof(result_generated_at), generated_at);
    generated_at_available = success && result_generated_at[0] != '\0';
    weather_state_available = success && weather_state != nullptr;
    if (weather_state_available) result_weather_state = *weather_state;
    result_has_list_state = success && list_state != nullptr;
    if (result_has_list_state) {
        result_list_state = *list_state;
    }
    cached_list_count = success && list_cache ? min<int8_t>(list_cache_count, LIST_COUNT_MAX) : 0;
    if (cached_list_count > 0) {
        memcpy(cached_list_states, list_cache, sizeof(ListPageState) * cached_list_count);
    }
    result_ready = true;
    request_in_flight = false;
}

void ListeFrigoApi::startFetch()
{
    if (!wifi_available || request_in_flight || result_ready || toggle_result_ready || task_handle == nullptr) {
        return;
    }

    Serial.println("API: GET /api/epaper/v1/state");
    request_kind = REQUEST_FETCH_STATE;
    request_in_flight = true;
    result_ready = false;
    state = API_FETCHING;
    xTaskNotifyGive(task_handle);
}

void ListeFrigoApi::startToggle()
{
    if (!wifi_available) {
        return;
    }
    Serial.printf("API POST START: id=%ld checked=%s generation=%lu\n",
                  static_cast<long>(toggle_item_id),
                  toggle_checked ? "true" : "false",
                  static_cast<unsigned long>(toggle_generation));
    request_kind = REQUEST_TOGGLE_ITEM;
    request_in_flight = true;
    toggle_result_ready = false;
    state = API_FETCHING;
    xTaskNotifyGive(task_handle);
}

void ListeFrigoApi::startAddItem()
{
    if (!wifi_available) {
        return;
    }
    Serial.printf("API: POST ajout item liste=%ld label=%s\n", static_cast<long>(toggle_item_id), add_label);
    request_kind = REQUEST_ADD_ITEM;
    request_in_flight = true;
    toggle_result_ready = false;
    state = API_FETCHING;
    xTaskNotifyGive(task_handle);
}

void ListeFrigoApi::startQueuedRequestIfAny()
{
    if (request_in_flight || result_ready || toggle_result_ready) {
        return;
    }

    if (!wifi_available) {
        if (!offline_wait_logged && hasPendingToggles()) {
            Serial.println("API: WiFi indisponible, ecritures locales en attente");
            offline_wait_logged = true;
        }
        return;
    }

    startNextToggle();
    if (request_in_flight || queued_request_kind == REQUEST_NONE) {
        return;
    }

    toggle_item_id = queued_toggle_item_id;
    toggle_checked = queued_toggle_checked;
    const RequestKind next_kind = queued_request_kind;
    queued_request_kind = REQUEST_NONE;
    if (next_kind == REQUEST_ADD_ITEM) {
        strlcpy(add_label, queued_add_label, sizeof(add_label));
        queued_add_label[0] = '\0';
        startAddItem();
        return;
    }
    if (next_kind == REQUEST_SELECT_LIST) {
        Serial.printf("API: POST select liste id=%ld\n", static_cast<long>(toggle_item_id));
        request_kind = REQUEST_SELECT_LIST;
        request_in_flight = true;
        toggle_result_ready = false;
        state = API_FETCHING;
        xTaskNotifyGive(task_handle);
    }
}

void ListeFrigoApi::finishToggle(bool success, int http_code, size_t bytes, const char *message,
                                 RequestKind kind, int32_t item_id, bool checked, uint32_t generation)
{
    result_http_code = http_code;
    result_bytes = bytes;
    result_success = success;
    copyMessage(result_message, sizeof(result_message), message);
    request_kind = kind;
    toggle_item_id = item_id;
    toggle_checked = checked;
    toggle_generation = generation;
    toggle_result_ready = true;
    request_in_flight = false;
}

void ListeFrigoApi::consumeResult()
{
    result_ready = false;

    if (result_success) {
        Serial.printf(
            "API: succes HTTP %d, %u octets, activeTab=%s, listes=%lu, items=%lu\n",
            result_http_code,
            static_cast<unsigned int>(result_bytes),
            result_active_tab,
            static_cast<unsigned long>(result_list_count),
            static_cast<unsigned long>(result_item_count)
        );
        retry_delay_ms = 10000;
        state = API_IDLE;
        next_fetch_ms = millis() + SUCCESS_FETCH_INTERVAL_MS;
        if (result_has_list_state && queued_request_kind == REQUEST_NONE) {
            list_state_available = true;
        } else if (result_has_list_state) {
            Serial.println("API: etat distant ignore, ecriture locale en attente");
        }
        startQueuedRequestIfAny();
        return;
    }

    Serial.printf("API: echec %s, %u octets\n", result_message, static_cast<unsigned int>(result_bytes));
    scheduleRetry();
    startQueuedRequestIfAny();
}

void ListeFrigoApi::consumeToggleResult()
{
    toggle_result_ready = false;

    if (result_success) {
        const char *operation = request_kind == REQUEST_ADD_ITEM ? "ajout envoye" :
                                request_kind == REQUEST_SELECT_LIST ? "selection envoyee" : "toggle envoye";
        if (request_kind == REQUEST_TOGGLE_ITEM) {
            PendingToggle *pending = findPendingToggle(toggle_item_id);
            if (pending && pending->in_flight_generation == toggle_generation) {
                pending->in_flight = false;
                pending->awaiting_confirmation = true;
                pending->retry_count = 0;
                pending->next_retry_ms = 0;
            }
            Serial.printf("API POST END: id=%ld HTTP=%d generation=%lu\n",
                          static_cast<long>(toggle_item_id), result_http_code,
                          static_cast<unsigned long>(toggle_generation));
        } else {
            Serial.printf("API: %s HTTP %d, %u octets\n",
                          operation, result_http_code, static_cast<unsigned int>(result_bytes));
        }
        retry_delay_ms = 10000;
        state = API_IDLE;
        next_fetch_ms = millis() + 1000;
        next_write_ms = millis() + WRITE_GAP_MS;
        return;
    }

    if (request_kind == REQUEST_TOGGLE_ITEM) {
        PendingToggle *pending = findPendingToggle(toggle_item_id);
        if (pending && pending->in_flight_generation == toggle_generation) {
            pending->in_flight = false;
            pending->dirty = true;
            deferToggleRetry(*pending);
        }
        Serial.printf("API POST END: id=%ld erreur=%s generation=%lu\n",
                      static_cast<long>(toggle_item_id), result_message,
                      static_cast<unsigned long>(toggle_generation));
    } else {
        Serial.printf("API: echec ecriture %s, %u octets\n", result_message, static_cast<unsigned int>(result_bytes));
    }
    state = API_IDLE;
    next_fetch_ms = millis() + 5000;
    next_write_ms = millis() + WRITE_GAP_MS;
}

ListeFrigoApi::PendingToggle *ListeFrigoApi::findPendingToggle(int32_t item_id)
{
    for (PendingToggle &pending : pending_toggles) {
        if (pending.id == item_id) {
            return &pending;
        }
    }
    return nullptr;
}

ListeFrigoApi::PendingToggle *ListeFrigoApi::findOrCreatePendingToggle(int32_t item_id)
{
    if (PendingToggle *existing = findPendingToggle(item_id)) {
        return existing;
    }
    for (PendingToggle &pending : pending_toggles) {
        if (pending.id == 0) {
            pending.id = item_id;
            return &pending;
        }
    }
    return nullptr;
}

bool ListeFrigoApi::hasPendingToggles() const
{
    for (const PendingToggle &pending : pending_toggles) {
        if (pending.id != 0 && (pending.dirty || pending.in_flight || pending.awaiting_confirmation)) {
            return true;
        }
    }
    return false;
}

void ListeFrigoApi::startNextToggle()
{
    if (!wifi_available || millis() < next_write_ms) {
        return;
    }
    for (int8_t i = 0; i < PENDING_TOGGLE_MAX; ++i) {
        PendingToggle &pending = pending_toggles[i];
        if (pending.id == 0 || !pending.dirty || pending.in_flight || millis() < pending.next_retry_ms) {
            continue;
        }
        toggle_item_id = pending.id;
        toggle_checked = pending.desired_checked;
        toggle_generation = pending.generation;
        pending.dirty = false;
        pending.in_flight = true;
        pending.in_flight_generation = toggle_generation;
        active_toggle_slot = i;
        startToggle();
        return;
    }
}

void ListeFrigoApi::deferToggleRetry(PendingToggle &pending)
{
    const size_t delay_index = min<size_t>(pending.retry_count, sizeof(TOGGLE_RETRY_DELAYS_MS) / sizeof(TOGGLE_RETRY_DELAYS_MS[0]) - 1);
    const uint32_t delay_ms = TOGGLE_RETRY_DELAYS_MS[delay_index];
    if (pending.retry_count < 255) {
        ++pending.retry_count;
    }
    pending.next_retry_ms = millis() + delay_ms;
    Serial.printf("API retry deferred id=%ld next=%lu ms attempt=%u\n",
                  static_cast<long>(pending.id), static_cast<unsigned long>(delay_ms), pending.retry_count);
}

void ListeFrigoApi::mergePendingToggles(ListPageState &remote_state)
{
    for (int8_t item_index = 0; item_index < remote_state.item_count; ++item_index) {
        GroceryItem &remote_item = remote_state.items[item_index];
        PendingToggle *pending = findPendingToggle(remote_item.id);
        if (pending == nullptr) {
            continue;
        }

        const bool remote_checked = remote_item.checked;
        const bool has_pending = pending->dirty || pending->in_flight || pending->awaiting_confirmation;
        if (!has_pending) {
            *pending = PendingToggle{};
            continue;
        }

        if (!pending->dirty && !pending->in_flight && pending->awaiting_confirmation &&
            remote_checked == pending->desired_checked) {
            Serial.printf("API MERGE: id=%ld confirmed checked=%s\n",
                          static_cast<long>(pending->id), remote_checked ? "true" : "false");
            *pending = PendingToggle{};
            continue;
        }

        remote_item.checked = pending->desired_checked;
        Serial.printf("API MERGE: id=%ld remote=%s localPending=%s -> effective=%s\n",
                      static_cast<long>(pending->id), remote_checked ? "true" : "false",
                      pending->desired_checked ? "true" : "false",
                      remote_item.checked ? "true" : "false");
    }
}

void ListeFrigoApi::scheduleRetry()
{
    state = API_WAITING_RETRY;
    next_fetch_ms = millis() + retry_delay_ms;
    Serial.printf("API: prochaine tentative dans %lu ms\n", static_cast<unsigned long>(retry_delay_ms));
    retry_delay_ms = min(retry_delay_ms * 2, MAX_RETRY_DELAY_MS);
}
