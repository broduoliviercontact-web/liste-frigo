#include "ListeFrigoApi.h"
#include "ListeFrigoMetro.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <esp_system.h>
#include "secrets.h"
#include "ListeFrigoTls.h"

namespace {

constexpr const char *EPAPER_STATE_URL = "https://liste-frigo.pliskain.chatgpt.site/api/epaper/v1/state";
constexpr const char *LISTS_API_URL = "https://liste-frigo.pliskain.chatgpt.site/api/lists";
constexpr uint32_t FIRST_FETCH_DELAY_MS = 3000;
constexpr uint32_t SUCCESS_FETCH_INTERVAL_MS = 15000;
constexpr uint32_t MAX_RETRY_DELAY_MS = 120000;
constexpr uint32_t HTTP_TIMEOUT_MS = 15000;
constexpr uint32_t WRITE_GAP_MS = 250;
constexpr uint32_t TOGGLE_RETRY_DELAYS_MS[] = {1000, 2000, 5000, 10000, 30000};

#if defined(SUPERVIE_ACCESS_CODE)
constexpr bool HAS_SUPERVIE_ACCESS_CODE = true;
#else
constexpr bool HAS_SUPERVIE_ACCESS_CODE = false;
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

void copyAgendaLabel(char *target, const char *source)
{
    copyEpaperText(target, AGENDA_LABEL_MAX, source, "Libre");
}

void copyAgendaCategory(char *target, const char *source)
{
    copyEpaperText(target, AGENDA_CATEGORY_MAX, source, "famille");
}

uint8_t dayOfMonthFromIsoDate(const char *date)
{
    if (!date || strlen(date) < 10) return 0;
    const int day = atoi(date + 8);
    return day >= 1 && day <= 31 ? static_cast<uint8_t>(day) : 0;
}

int8_t hourFromIso(const char *timestamp)
{
    if (!timestamp || strlen(timestamp) < 13 || timestamp[10] != 'T') {
        return -1;
    }
    const int hour = atoi(timestamp + 11);
    return hour >= 0 && hour < 24 ? hour : -1;
}

int16_t mapXFromLongitude(float longitude)
{
    const int value = static_cast<int>(((longitude + 180.0f) / 360.0f) * 255.0f + 0.5f);
    return constrain(value, 0, 255);
}

int16_t mapYFromLatitude(float latitude)
{
    const int value = static_cast<int>(((90.0f - latitude) / 180.0f) * 255.0f + 0.5f);
    return constrain(value, 0, 255);
}

bool readIssTrackPoint(JsonObject point, IssTrackPoint &target)
{
    if (!point["x"].isNull() && !point["y"].isNull()) {
        target.x = constrain(point["x"].as<int>(), 0, 255);
        target.y = constrain(point["y"].as<int>(), 0, 255);
        return true;
    }
    if (!point["longitude"].isNull() && !point["latitude"].isNull()) {
        target.x = mapXFromLongitude(point["longitude"].as<float>());
        target.y = mapYFromLatitude(point["latitude"].as<float>());
        return true;
    }
    return false;
}

int8_t readIssTrack(JsonArray points, IssTrackPoint *target, int8_t max_count)
{
    int8_t count = 0;
    for (JsonObject point : points) {
        if (count >= max_count) break;
        if (readIssTrackPoint(point, target[count])) ++count;
    }
    return count;
}

uint16_t distanceFromPantinKm(float latitude, float longitude)
{
    constexpr float PANTIN_LATITUDE = 48.8966f;
    constexpr float PANTIN_LONGITUDE = 2.4017f;
    constexpr float EARTH_RADIUS_KM = 6371.0f;
    constexpr float DEG_TO_RAD_F = 0.01745329252f;
    const float latitude_delta = (latitude - PANTIN_LATITUDE) * DEG_TO_RAD_F;
    const float longitude_delta = (longitude - PANTIN_LONGITUDE) * DEG_TO_RAD_F;
    const float latitude_a = PANTIN_LATITUDE * DEG_TO_RAD_F;
    const float latitude_b = latitude * DEG_TO_RAD_F;
    const float sin_latitude = sinf(latitude_delta * 0.5f);
    const float sin_longitude = sinf(longitude_delta * 0.5f);
    const float haversine = sin_latitude * sin_latitude +
                            cosf(latitude_a) * cosf(latitude_b) * sin_longitude * sin_longitude;
    const float central_angle = 2.0f * atan2f(sqrtf(haversine), sqrtf(max(0.0f, 1.0f - haversine)));
    return static_cast<uint16_t>(roundf(EARTH_RADIUS_KM * central_angle));
}

struct AircraftMetadata {
    const char *callsign;
    const char *tail_number;
    const char *airline;
    const char *aircraft_type;
    const char *route;
    const char *bearing;
    uint16_t distance_km;
};

const AircraftMetadata AIRCRAFT_METADATA[] = {
    {"AFR76P", "F-GZNP", "Air France", "Boeing 777", "CDG > Montreal", "NE", 31},
    {"RYR32HA", "EI-EKD", "Ryanair", "Boeing 737", "Beauvais > Porto", "E", 8},
    {"EJU49KT", "OE-IJZ", "easyJet", "Airbus A320", "CDG > Toulouse", "SW", 27},
    {"TVF1QD", "F-HTVC", "Transavia", "Boeing 737", "Orly > Lisbonne", "NW", 24},
    {"BAW8SG", "G-EUUT", "British Airways", "Airbus A320", "Londres > Geneve", "SE", 34},
    {"DAH108S", "7T-VKE", "Air Algerie", "Boeing 737", "CDG > Alger", "N", 4},
    {"DLH7MC", "D-AIWI", "Lufthansa", "Airbus A320", "Francfort > Paris", "E", 38},
    {"VLG42Z", "EC-MHA", "Vueling", "Airbus A321", "Paris > Barcelone", "S", 48},
    {"TRA9KL", "PH-HXN", "Transavia", "Boeing 737", "Rotterdam > Orly", "W", 33},
    {"KLM88R", "PH-BXN", "KLM", "Boeing 737", "Paris > Amsterdam", "N", 41},
};

void applyAircraftMetadata(Aircraft &target)
{
    for (const AircraftMetadata &metadata : AIRCRAFT_METADATA) {
        if (strcmp(target.registration, metadata.callsign) != 0) continue;
        if (!target.tail_number[0]) copyEpaperText(target.tail_number, sizeof(target.tail_number), metadata.tail_number, "-");
        if (!target.airline[0]) copyEpaperText(target.airline, sizeof(target.airline), metadata.airline, "-");
        if (!target.aircraft_type[0]) copyEpaperText(target.aircraft_type, sizeof(target.aircraft_type), metadata.aircraft_type, "-");
        if (!target.route[0]) copyEpaperText(target.route, sizeof(target.route), metadata.route, "-");
        if (!target.bearing[0]) strlcpy(target.bearing, metadata.bearing, sizeof(target.bearing));
        if (target.distance_km == 0) target.distance_km = metadata.distance_km;
        return;
    }
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

        secure_client.setCACert(SUPERVIE_TLS_CA);
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
        MealWeekState fetched_meal_week = {};
        bool has_meal_week_state = false;
        MetroState fetched_metro = {};
        bool has_metro_state = false;
        EpaperSettings fetched_settings = {};
        bool has_settings = false;
        IssState fetched_iss = {};
        bool has_iss_state = false;
        AirState fetched_air = {};
        bool has_air_state = false;
        BoatsState fetched_boats = {};
        bool has_boats_state = false;
        AgendaState fetched_agenda = {};
        bool has_agenda_state = false;
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
            const char *collected[] = {"Retry-After"};
            http.collectHeaders(collected, 1);
            http.addHeader("Accept", "application/json");
#if defined(SUPERVIE_ACCESS_CODE)
            http.addHeader("X-SUPERVIE-ACCESS-CODE", SUPERVIE_ACCESS_CODE);
#endif
            if (is_write_request) {
                http.addHeader("Content-Type", "application/json");
                if (kind == ListeFrigoApi::REQUEST_ADD_ITEM) {
                    char key[33] = {}; client->snapshotAddKey(key, sizeof(key));
                    http.addHeader("x-supervie-mutation-id", key);
                }
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
            if (http_code == 429) client->setWriteRetryAfter(http.header("Retry-After").c_str());

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
                        summary.remaining_count = constrain(list["remainingCount"] | summary.remaining_count, 0, 999);
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
                        cached.remaining_count = summaries[fetched_list_cache_count].remaining_count;
                        cached.item_overflow = constrain(list["overflow"] | 0, 0, 255);
                        cached.list_overflow = constrain(doc["pages"]["listes"]["overflow"] | 0, 0, 255);
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

                    JsonObject meals = doc["pages"]["repas"].as<JsonObject>();
                    if (strcmp(meals["status"] | "", "ready") == 0) {
                        fetched_meal_week.available = true;
                        for (JsonObject meal : meals["meals"].as<JsonArray>()) {
                            if (fetched_meal_week.meal_count >= WEEK_MEAL_COUNT) break;
                            const int day_index = meal["dayIndex"] | -1;
                            const char *moment = meal["moment"] | "";
                            if (day_index < 0 || day_index > 6 || (strcmp(moment, "midi") != 0 && strcmp(moment, "soir") != 0)) continue;
                            WeekMeal &target = fetched_meal_week.meals[fetched_meal_week.meal_count++];
                            target.day_index = static_cast<uint8_t>(day_index);
                            target.lunch = strcmp(moment, "midi") == 0;
                            copyEpaperText(target.label, sizeof(target.label), meal["label"] | "", "-");
                        }
                        has_meal_week_state = true;
                    }

                    JsonObject metro = doc["pages"]["metro"].as<JsonObject>();
                    if (strcmp(metro["status"] | "", "ready") == 0) {
                        fetched_metro.available = true;
                        strlcpy(fetched_metro.updated_at, metro["updatedAt"] | "", sizeof(fetched_metro.updated_at));
                        for (JsonObject line : metro["lines"].as<JsonArray>()) {
                            if (fetched_metro.line_count >= METRO_LINE_COUNT) break;
                            MetroLine &target = fetched_metro.lines[fetched_metro.line_count++];
                            copyEpaperText(target.label, sizeof(target.label), line["label"] | "-", "-");
                            copyEpaperText(target.stop, sizeof(target.stop), line["stop"] | "", "-");
                            target.metro = strcmp(line["mode"] | "", "metro") == 0;
                            target.available = line["available"] | false;
                            for (JsonObject direction : line["directions"].as<JsonArray>()) {
                                if (target.direction_count >= METRO_DIRECTION_COUNT) break;
                                MetroDirection &target_direction = target.directions[target.direction_count];
                                copyEpaperText(target_direction.destination, sizeof(target_direction.destination), direction["destination"] | "", "-");
                            for (JsonVariant minute : direction["minutes"].as<JsonArray>()) {
                                if (target_direction.passage_count >= METRO_PASSAGE_COUNT) break;
                                uint8_t parsed_minutes = 0;
                                if (!decodeMetroMinute(minute, parsed_minutes)) continue;
                                target_direction.minutes[target_direction.passage_count++] = parsed_minutes;
                            }
                                if (target_direction.passage_count > 0) ++target.direction_count;
                            }
                            target.available = target.available && target.direction_count > 0;
                        }
                    }
                    // A valid aggregate snapshot explicitly replaces the
                    // previous state even when Metro is unavailable. Keeping
                    // the old values would display stale departures as live.
                    has_metro_state = !metro.isNull();

                    JsonObject agenda = doc["pages"]["agenda"].as<JsonObject>();
                    if (strcmp(agenda["status"] | "", "ready") == 0) {
                        fetched_agenda.available = true;
                        const char *agenda_mode = agenda["mode"] | "horizontal";
                        fetched_agenda.vertical_layout = strcmp(agenda_mode, "vertical") == 0;
                        fetched_agenda.event_count = constrain(agenda["eventCount"] | 0, 0, 255);
                        for (JsonObject item : agenda["upcoming"].as<JsonArray>()) {
                            if (fetched_agenda.upcoming_count >= AGENDA_DAY_ITEM_MAX) break;
                            AgendaItem &target = fetched_agenda.upcoming[fetched_agenda.upcoming_count++];
                            strlcpy(target.time, item["time"] | "", sizeof(target.time));
                            copyAgendaLabel(target.label, item["title"] | item["label"] | "A planifier");
                            copyAgendaCategory(target.category, item["category"] | "famille");
                        }
                        const char *today = agenda["today"] | "";
                        for (JsonObject day : agenda["days"].as<JsonArray>()) {
                            if (fetched_agenda.day_count >= AGENDA_DAY_COUNT) break;
                            AgendaDay &target_day = fetched_agenda.days[fetched_agenda.day_count++];
                            target_day.day_index = constrain(day["dayIndex"] | fetched_agenda.day_count - 1, 0, 6);
                            const char *date = day["date"] | "";
                            target_day.day_of_month = dayOfMonthFromIsoDate(date);
                            target_day.today = today && *today && strcmp(date, today) == 0;
                            target_day.overflow = constrain(day["overflow"] | 0, 0, 255);
                            for (JsonObject item : day["items"].as<JsonArray>()) {
                                if (target_day.item_count >= AGENDA_DAY_ITEM_MAX) break;
                                AgendaItem &target = target_day.items[target_day.item_count++];
                                strlcpy(target.time, item["time"] | "", sizeof(target.time));
                                copyAgendaLabel(target.label, item["label"] | item["title"] | "Libre");
                                copyAgendaCategory(target.category, item["category"] | "famille");
                            }
                        }
                        has_agenda_state = fetched_agenda.day_count > 0;
                    }

                    JsonObject settings = doc["epaperSettings"].as<JsonObject>();
                    if (settings.isNull()) {
                        settings = doc["pages"]["reglages"].as<JsonObject>();
                    }
                    if (!settings.isNull()) {
                        const char *preferred_tab = settings["preferredTab"] | "";
                        if (!preferred_tab || !*preferred_tab) preferred_tab = settings["activeTab"] | "";
                        fetched_settings.preferred_tab = navTabFromApiKey(preferred_tab);
                        JsonArray visible_tabs = settings["visibleTabs"].as<JsonArray>();
                        for (JsonVariant value : visible_tabs) {
                            if (fetched_settings.visible_tab_count >= NAV_VISIBLE_TAB_MAX) break;
                            const NavTabId tab = navTabFromApiKey(value.as<const char *>());
                            if (tab == TAB_NONE) continue;
                            bool duplicate = false;
                            for (int8_t i = 0; i < fetched_settings.visible_tab_count; ++i) {
                                if (fetched_settings.visible_tabs[i] == tab) {
                                    duplicate = true;
                                    break;
                                }
                            }
                            if (!duplicate) fetched_settings.visible_tabs[fetched_settings.visible_tab_count++] = tab;
                        }
                        fetched_settings.carousel_enabled = settings["carousel"]["enabled"] | false;
                        fetched_settings.carousel_interval_seconds = settings["carousel"]["intervalSeconds"] | 120;
                        if (fetched_settings.carousel_interval_seconds < 30) fetched_settings.carousel_interval_seconds = 30;
                        has_settings = true;
                    }

                    JsonObject iss = doc["pages"]["iss"].as<JsonObject>();
                    if (strcmp(iss["status"] | "", "ready") == 0) {
                        fetched_iss.available = true;
                        copyEpaperText(fetched_iss.over, sizeof(fetched_iss.over), iss["over"] | "North Pacific Ocean", "Earth orbit");
                        fetched_iss.speed_kmh = iss["speedKmh"] | 27598;
                        const bool has_coordinates = !iss["longitude"].isNull() && !iss["latitude"].isNull();
                        const float longitude = iss["longitude"] | 0.0f;
                        const float latitude = iss["latitude"] | 0.0f;
                        if (has_coordinates) fetched_iss.distance_km = distanceFromPantinKm(latitude, longitude);
                        JsonObject position = iss["position"].as<JsonObject>();
                        if (!position.isNull() && !position["x"].isNull() && !position["y"].isNull()) {
                            fetched_iss.map_x = constrain(position["x"].as<int>(), 0, 255);
                            fetched_iss.map_y = constrain(position["y"].as<int>(), 0, 255);
                        } else {
                            fetched_iss.map_x = mapXFromLongitude(longitude);
                            fetched_iss.map_y = mapYFromLatitude(latitude);
                        }
                        fetched_iss.track_count = readIssTrack(iss["track"].as<JsonArray>(), fetched_iss.track, ISS_TRACK_POINT_COUNT);
                        fetched_iss.past_track_count = readIssTrack(iss["pastTrack"].as<JsonArray>(), fetched_iss.past_track, ISS_TRACK_POINT_COUNT);
                        fetched_iss.future_track_count = readIssTrack(iss["futureTrack"].as<JsonArray>(), fetched_iss.future_track, ISS_TRACK_POINT_COUNT);
                        has_iss_state = true;
                    }

                    has_iss_state = true; // Explicit unavailable must clear the previous page.

                    JsonObject air = doc["pages"]["air"].as<JsonObject>();
                    if (strcmp(air["status"] | "", "ready") == 0) {
                        fetched_air.available = true;
                        fetched_air.radius_km = air["radiusKm"] | 25;
                        fetched_air.simulation = strcmp(air["scan"]["mode"] | "", "simulation") == 0;
                        for (JsonObject aircraft : air["aircraft"].as<JsonArray>()) {
                            if (fetched_air.aircraft_count >= AIRCRAFT_COUNT) break;
                            Aircraft &target = fetched_air.aircraft[fetched_air.aircraft_count++];
                            const char *callsign = aircraft["callsign"] | "";
                            if (!callsign || !*callsign) callsign = aircraft["id"] | "";
                            if (!callsign || !*callsign) callsign = aircraft["registration"] | "PLANE";
                            copyEpaperText(target.registration, sizeof(target.registration), callsign, "PLANE");
                            copyEpaperText(target.tail_number, sizeof(target.tail_number), aircraft["tailNumber"] | "", "");
                            copyEpaperText(target.airline, sizeof(target.airline), aircraft["airline"] | "", "");
                            const char *aircraft_type = aircraft["aircraftType"] | "";
                            if (!aircraft_type || !*aircraft_type) aircraft_type = aircraft["aircraft"] | "";
                            copyEpaperText(target.aircraft_type, sizeof(target.aircraft_type), aircraft_type, "");
                            copyEpaperText(target.route, sizeof(target.route), aircraft["route"] | "", "");
                            copyEpaperText(target.bearing, sizeof(target.bearing), aircraft["bearing"] | "", "");
                            target.x = constrain(aircraft["x"] | 128, 0, 255);
                            target.y = constrain(aircraft["y"] | 128, 0, 255);
                            target.heading = constrain(aircraft["heading"] | 0, 0, 359);
                            target.altitude_m = constrain(aircraft["altitudeM"] | 0, 0, 65535);
                            target.speed_kmh = constrain(aircraft["speedKmh"] | 0, 0, 65535);
                            target.distance_km = constrain(aircraft["distanceKm"] | 0, 0, 65535);
                            applyAircraftMetadata(target);
                        }
                        has_air_state = fetched_air.aircraft_count > 0;
                    }

                    JsonObject boats = doc["pages"]["bateaux"].as<JsonObject>();
                    if (!boats.isNull()) {
                        const char *status = boats["status"] | "degraded";
                        fetched_boats.degraded = strcmp(status, "degraded") == 0;
                        strlcpy(fetched_boats.updated_at, boats["updatedAt"] | "", sizeof(fetched_boats.updated_at));
                        for (JsonObject boat : boats["boats"].as<JsonArray>()) {
                            if (fetched_boats.boat_count >= BOAT_COUNT) break;
                            Boat &target = fetched_boats.boats[fetched_boats.boat_count++];
                            copyEpaperText(target.name, sizeof(target.name), boat["name"] | "Bateau", "Bateau");
                            const float distance_km = max(0.0f, boat["distanceKm"] | 0.0f);
                            const float speed_kmh = max(0.0f, boat["speedKmh"] | 0.0f);
                            target.distance_tenths_km = constrain(static_cast<int>(roundf(distance_km * 10.0f)), 0, 65535);
                            target.speed_tenths_kmh = constrain(static_cast<int>(roundf(speed_kmh * 10.0f)), 0, 65535);
                            target.eta_minutes = boat["etaMinutes"].isNull() ? -1 : constrain(boat["etaMinutes"].as<int>(), 0, 32767);
                            const char *direction = boat["direction"] | "INDETERMINE";
                            target.direction = strcmp(direction, "PARIS") == 0 ? BOAT_DIRECTION_PARIS :
                                               strcmp(direction, "BOBIGNY") == 0 ? BOAT_DIRECTION_BOBIGNY : BOAT_DIRECTION_UNKNOWN;
                        }
                        fetched_boats.available = fetched_boats.boat_count > 0;
                        has_boats_state = true;
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
                                has_weather_state ? &fetched_weather : nullptr,
                                has_meal_week_state ? &fetched_meal_week : nullptr,
                                has_metro_state ? &fetched_metro : nullptr,
                                has_settings ? &fetched_settings : nullptr,
                                has_iss_state ? &fetched_iss : nullptr,
                                has_air_state ? &fetched_air : nullptr,
                                has_agenda_state ? &fetched_agenda : nullptr,
                                has_boats_state ? &fetched_boats : nullptr);
        }
    }
}

} // namespace

void ListeFrigoApi::begin()
{
    if (!HAS_SUPERVIE_ACCESS_CODE) {
        Serial.println("API: SUPERVIE_ACCESS_CODE absent dans secrets.h, client en attente");
        state = API_DISABLED;
        return;
    }

    add_store_ready = add_store.begin("frigo-adds", false);
    if (add_store_ready && add_store.getBytesLength("queue") > 0) {
        if (add_store.getBytesLength("queue") != sizeof(adds) || add_store.getBytes("queue", &adds, sizeof(adds)) != sizeof(adds) || adds.version != 1 || adds.count > 8) {
            add_store_ready = false; notice("Journal ajouts invalide : verifier sur site");
        }
    }
    BaseType_t created = xTaskCreatePinnedToCore(fetchTask, "epaper_api", 12288, this, 1, &task_handle, 0);
    if (created != pdPASS) {
        Serial.println("API: erreur creation tache HTTP au demarrage");
        state = API_DISABLED;
        return;
    }

    Serial.printf("API: client e-paper pret, ajouts conserves=%u\n", adds.count);
    if (adds.count) notice("Ajouts conserves : verification en cours");
    for (uint8_t i = 0; i < adds.count; ++i) if (adds.entries[i].blocked) notice("Ajouts bloques : verifier la liste sur site");
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

bool ListeFrigoApi::takeMealWeekState(MealWeekState &target)
{
    if (!meal_week_state_available) return false;
    target = result_meal_week_state;
    meal_week_state_available = false;
    return true;
}

bool ListeFrigoApi::takeMetroState(MetroState &target)
{
    if (!metro_state_available) return false;
    target = result_metro_state;
    metro_state_available = false;
    return true;
}

bool ListeFrigoApi::takeEpaperSettings(EpaperSettings &target)
{
    if (!epaper_settings_available) return false;
    target = result_epaper_settings;
    epaper_settings_available = false;
    return true;
}

bool ListeFrigoApi::takeIssState(IssState &target)
{
    if (!iss_state_available) return false;
    target = result_iss_state;
    iss_state_available = false;
    return true;
}

bool ListeFrigoApi::takeAirState(AirState &target)
{
    if (!air_state_available) return false;
    target = result_air_state;
    air_state_available = false;
    return true;
}

bool ListeFrigoApi::takeAgendaState(AgendaState &target)
{
    if (!agenda_state_available) return false;
    target = result_agenda_state;
    agenda_state_available = false;
    return true;
}

bool ListeFrigoApi::takeBoatsState(BoatsState &target)
{
    if (!boats_state_available) return false;
    target = result_boats_state;
    boats_state_available = false;
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

bool ListeFrigoApi::persistAdds() {
    return add_store_ready && add_store.putBytes("queue", &adds, sizeof(adds)) == sizeof(adds);
}
uint64_t ListeFrigoApi::serverNow() const {
    return server_epoch_ms ? server_epoch_ms + static_cast<uint32_t>(millis() - server_epoch_tick) : 0;
}
void ListeFrigoApi::notice(const char *message) {
    strlcpy(write_notice, message, sizeof(write_notice)); write_notice_ready = true;
}
bool ListeFrigoApi::takeWriteNotice(char *target, size_t size) {
    if (!write_notice_ready) return false;
    strlcpy(target, write_notice, size); write_notice_ready = false; return true;
}
void ListeFrigoApi::setWriteRetryAfter(const char *value) {
    write_retry_ms = 60000;
    char *end = nullptr; const unsigned long seconds = strtoul(value, &end, 10);
    if (*value && end && !*end && seconds <= 86400UL) { write_retry_ms = seconds * 1000UL; return; }
    struct tm parsed = {};
    if (strptime(value, "%a, %d %b %Y %H:%M:%S GMT", &parsed) && serverNow()) {
        const uint64_t target = static_cast<uint64_t>(mktime(&parsed)) * 1000;
        if (target > serverNow()) write_retry_ms = static_cast<uint32_t>(min<uint64_t>(target - serverNow(), 86400000ULL));
    }
}
void ListeFrigoApi::snapshotAddKey(char *target, size_t size) const {
    strlcpy(target, active_add >= 0 ? adds.entries[active_add].key : "", size);
}
bool ListeFrigoApi::sendAddItem(int32_t list_id, const char *label) {
    if (!add_store_ready || !serverNow() || list_id <= 0 || !label || !*label) {
        notice("Ajout non envoye : synchronisation requise"); return false;
    }
    DurableAdd entry; entry.list_id = list_id; entry.created_at = serverNow();
    strlcpy(entry.label, label, sizeof(entry.label));
    snprintf(entry.key, sizeof(entry.key), "%08lx%08lx%08lx%08lx", static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
    if (!adds.append(entry)) { notice("File pleine : verifier les ajouts sur site"); return false; }
    if (!persistAdds()) { adds.remove(adds.count - 1); notice("Journal indisponible : ajout non envoye"); return false; }
    notice("Ajout conserve, en attente de confirmation");
    startQueuedRequestIfAny(); return true;
}
void ListeFrigoApi::startNextAdd() {
    if (!serverNow() || !add_store_ready || static_cast<int32_t>(millis() - next_write_ms) < 0) return;
    for (uint8_t i = 0; i < adds.count; ++i) {
        auto &entry = adds.entries[i];
        if (entry.blocked) continue;
        if (addExpired(entry.created_at, serverNow()) || entry.attempts >= 4) {
            entry.blocked = addExpired(entry.created_at, serverNow()) ? 3 : 2;
            if (!persistAdds()) add_store_ready = false;
            notice("Ajout incertain : verifier la liste sur site"); continue;
        }
        active_add = i; toggle_item_id = entry.list_id;
        strlcpy(add_label, entry.label, sizeof(add_label));
        ++entry.attempts;
        if (!persistAdds()) { --entry.attempts; add_store_ready = false; notice("Journal indisponible : ajout suspendu"); return; }
        startAddItem(); return;
    }
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
                                const WeatherState *weather_state, const MealWeekState *meal_week_state,
                                const MetroState *metro_state, const EpaperSettings *settings,
                                const IssState *iss_state, const AirState *air_state,
                                const AgendaState *agenda_state, const BoatsState *boats_state)
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
    meal_week_state_available = success && meal_week_state != nullptr;
    if (meal_week_state_available) result_meal_week_state = *meal_week_state;
    metro_state_available = success && metro_state != nullptr;
    if (metro_state_available) result_metro_state = *metro_state;
    epaper_settings_available = success && settings != nullptr;
    if (epaper_settings_available) result_epaper_settings = *settings;
    iss_state_available = success && iss_state != nullptr;
    if (iss_state_available) result_iss_state = *iss_state;
    air_state_available = success && air_state != nullptr;
    if (air_state_available) result_air_state = *air_state;
    agenda_state_available = success && agenda_state != nullptr;
    if (agenda_state_available) result_agenda_state = *agenda_state;
    boats_state_available = success && boats_state != nullptr;
    if (boats_state_available) result_boats_state = *boats_state;
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
    if (!request_in_flight) startNextAdd();
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
        struct tm parsed = {};
        if (strptime(result_generated_at, "%Y-%m-%dT%H:%M:%S", &parsed)) {
            server_epoch_ms = static_cast<uint64_t>(mktime(&parsed)) * 1000;
            server_epoch_tick = millis();
        }
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

    if (request_kind == REQUEST_ADD_ITEM && active_add >= 0) {
        if (result_success) {
            DurableAdds before = adds; adds.remove(active_add);
            if (!persistAdds()) { adds = before; notice("Ajout confirme, nettoyage journal en attente"); }
            else notice("Ajout confirme");
        } else if (result_http_code >= 400 && result_http_code < 500 && result_http_code != 401 && result_http_code != 429 && result_http_code != 409) {
            adds.entries[active_add].blocked = 1;
            if (!persistAdds()) add_store_ready = false;
            notice("Ajout refuse : verifier la liste sur site");
        } else { notice("Ajout incertain, reprise avec la meme cle"); }
        active_add = -1; state = API_IDLE; next_write_ms = millis() + (result_http_code == 429 ? write_retry_ms : 5000);
        next_fetch_ms = millis() + 1000; return;
    }

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

bool ListeFrigoApi::hasBlockedAdds() const {
    for (uint8_t i = 0; i < adds.count; ++i) if (adds.entries[i].blocked) return true;
    return false;
}
bool ListeFrigoApi::acknowledgeBlockedAdds() {
    if (request_in_flight || active_add >= 0) { notice("Attendre la fin de la synchronisation"); return false; }
    DurableAdds before = adds;
    for (int i = adds.count - 1; i >= 0; --i) if (adds.entries[i].blocked) adds.remove(i);
    if (!persistAdds()) { adds = before; notice("Historique conserve : stockage indisponible"); return false; }
    notice("Historique acquitte, aucun ajout renvoye"); return true;
}
