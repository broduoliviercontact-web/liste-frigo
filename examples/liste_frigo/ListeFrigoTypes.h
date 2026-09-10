#pragma once

#include <Arduino.h>
#include "epd_driver.h"

constexpr int32_t LOGICAL_WIDTH = EPD_HEIGHT;   // 540
constexpr int32_t LOGICAL_HEIGHT = EPD_WIDTH;   // 960
constexpr size_t FRAMEBUFFER_BYTES = EPD_WIDTH * EPD_HEIGHT / 2;
constexpr int8_t NAV_TAB_COUNT = 9;
constexpr int8_t NAV_VISIBLE_TAB_MAX = 8;
constexpr int32_t NAV_LEFT = 32;
constexpr int32_t NAV_TOP = 850;
constexpr int32_t NAV_WIDTH = LOGICAL_WIDTH - (NAV_LEFT * 2);
constexpr int32_t NAV_HEIGHT = 78;
constexpr int32_t NAV_GAP = 6;
constexpr int8_t LIST_ITEM_COUNT = 24;
constexpr int8_t VISIBLE_LIST_ROWS = 6;
constexpr int32_t LIST_TOP_Y = 220;
constexpr int32_t LIST_ROW_HEIGHT = 62;
constexpr int8_t LIST_LABEL_MAX = 24;
constexpr int8_t LIST_NAME_MAX = 24;
constexpr int8_t LIST_COUNT_MAX = 8;
constexpr int8_t WEATHER_HOUR_COUNT = 12;
constexpr int8_t WEATHER_LOCATION_MAX = 16;
constexpr int8_t WEATHER_UPDATED_AT_MAX = 32;
constexpr int8_t WEEK_MEAL_COUNT = 14;
constexpr int8_t MEAL_LABEL_MAX = 32;
constexpr int8_t METRO_LINE_COUNT = 6;
constexpr int8_t METRO_LABEL_MAX = 6;
constexpr int8_t METRO_DESTINATION_MAX = 32;
constexpr int8_t METRO_STOP_MAX = 32;
constexpr int8_t METRO_PASSAGE_COUNT = 3;
constexpr int8_t METRO_DIRECTION_COUNT = 2;
constexpr int8_t ISS_TRACK_POINT_COUNT = 16;
constexpr int8_t AIRCRAFT_COUNT = 8;
constexpr int8_t AIRCRAFT_LABEL_MAX = 10;
constexpr int8_t AIRCRAFT_AIRLINE_MAX = 20;
constexpr int8_t AIRCRAFT_TYPE_MAX = 18;
constexpr int8_t AIRCRAFT_ROUTE_MAX = 34;
constexpr int8_t AGENDA_DAY_COUNT = 7;
constexpr int8_t AGENDA_DAY_ITEM_MAX = 2;
constexpr int8_t AGENDA_LABEL_MAX = 40;
constexpr int8_t AGENDA_TIME_MAX = 6;
constexpr int8_t AGENDA_CATEGORY_MAX = 12;

enum NavTabId : int8_t {
    TAB_LISTES = 0,
    TAB_METEO = 1,
    TAB_CRECHE = 2,
    TAB_REPAS = 3,
    TAB_METRO = 4,
    TAB_REGLAGES = 5,
    TAB_ISS = 6,
    TAB_AIR = 7,
    TAB_AGENDA = 8,
    TAB_NONE = -1,
};

enum TouchKind : int8_t {
    TOUCH_TAP,
    TOUCH_SWIPE_UP,
    TOUCH_SWIPE_DOWN,
};

struct GroceryItem {
    int32_t id;
    char label[LIST_LABEL_MAX];
    bool checked;
};

struct ListSummary {
    int32_t id;
    char name[LIST_NAME_MAX];
    int8_t remaining_count;
};

struct ListPageState {
    int32_t id;
    char name[LIST_NAME_MAX];
    ListSummary lists[LIST_COUNT_MAX];
    int8_t list_count;
    GroceryItem items[LIST_ITEM_COUNT];
    int8_t item_count;
    int8_t scroll_offset;
};

struct WeatherHour {
    uint8_t hour;
    int8_t temperature;
    int16_t weather_code;
    bool is_day;
};

struct CrecheForecast {
    bool available;
    int8_t temperature;
    int16_t weather_code;
    bool is_day;
};

struct WeatherState {
    bool available;
    char location[WEATHER_LOCATION_MAX];
    char updated_at[WEATHER_UPDATED_AT_MAX];
    int8_t current_temperature;
    int16_t current_weather_code;
    bool current_is_day;
    int8_t today_min;
    int8_t today_max;
    int16_t today_weather_code;
    int8_t tomorrow_min;
    int8_t tomorrow_max;
    int16_t tomorrow_weather_code;
    WeatherHour hourly[WEATHER_HOUR_COUNT];
    int8_t hourly_count;
    CrecheForecast departure;
    CrecheForecast return_forecast;
};

struct WeekMeal {
    uint8_t day_index;
    bool lunch;
    char label[MEAL_LABEL_MAX];
};

struct MealWeekState {
    bool available;
    WeekMeal meals[WEEK_MEAL_COUNT];
    int8_t meal_count;
};

struct MetroDirection {
    char destination[METRO_DESTINATION_MAX];
    uint8_t minutes[METRO_PASSAGE_COUNT];
    int8_t passage_count;
};

struct MetroLine {
    char label[METRO_LABEL_MAX];
    char stop[METRO_STOP_MAX];
    MetroDirection directions[METRO_DIRECTION_COUNT];
    int8_t direction_count;
    bool metro;
    bool available;
};

struct MetroState {
    bool available;
    char updated_at[WEATHER_UPDATED_AT_MAX];
    MetroLine lines[METRO_LINE_COUNT];
    int8_t line_count;
};

struct EpaperSettings {
    NavTabId visible_tabs[NAV_VISIBLE_TAB_MAX];
    int8_t visible_tab_count;
    NavTabId preferred_tab;
    bool carousel_enabled;
    uint16_t carousel_interval_seconds;
};

struct IssTrackPoint {
    int16_t x;
    int16_t y;
};

struct IssState {
    bool available;
    char over[32];
    uint16_t speed_kmh;
    uint16_t distance_km;
    int16_t map_x;
    int16_t map_y;
    IssTrackPoint track[ISS_TRACK_POINT_COUNT];
    int8_t track_count;
    IssTrackPoint past_track[ISS_TRACK_POINT_COUNT];
    int8_t past_track_count;
    IssTrackPoint future_track[ISS_TRACK_POINT_COUNT];
    int8_t future_track_count;
};

struct Aircraft {
    char registration[AIRCRAFT_LABEL_MAX];
    char tail_number[AIRCRAFT_LABEL_MAX];
    char airline[AIRCRAFT_AIRLINE_MAX];
    char aircraft_type[AIRCRAFT_TYPE_MAX];
    char route[AIRCRAFT_ROUTE_MAX];
    char bearing[4];
    int16_t x;
    int16_t y;
    int16_t heading;
    uint16_t altitude_m;
    uint16_t speed_kmh;
    uint16_t distance_km;
};

struct AirState {
    bool available;
    uint16_t radius_km;
    Aircraft aircraft[AIRCRAFT_COUNT];
    int8_t aircraft_count;
};

struct AgendaItem {
    char time[AGENDA_TIME_MAX];
    char label[AGENDA_LABEL_MAX];
    char category[AGENDA_CATEGORY_MAX];
};

struct AgendaDay {
    uint8_t day_index;
    uint8_t day_of_month;
    bool today;
    AgendaItem items[AGENDA_DAY_ITEM_MAX];
    int8_t item_count;
    uint8_t overflow;
};

struct AgendaState {
    bool available;
    bool vertical_layout;
    uint8_t event_count;
    AgendaItem upcoming[AGENDA_DAY_ITEM_MAX];
    int8_t upcoming_count;
    AgendaDay days[AGENDA_DAY_COUNT];
    int8_t day_count;
};

struct TouchEvent {
    int16_t physical_x;
    int16_t physical_y;
    int16_t logical_x;
    int16_t logical_y;
    int16_t logical_end_x;
    int16_t logical_end_y;
    int16_t delta_y;
    TouchKind kind;
    NavTabId tab;
};

inline const char *touchKindName(TouchKind kind)
{
    switch (kind) {
    case TOUCH_TAP:
        return "tap";
    case TOUCH_SWIPE_UP:
        return "scroll_bas";
    case TOUCH_SWIPE_DOWN:
        return "scroll_haut";
    default:
        return "inconnu";
    }
}

inline const char *navAsciiName(NavTabId tab)
{
    switch (tab) {
    case TAB_LISTES:
        return "Listes";
    case TAB_METEO:
        return "Meteo";
    case TAB_CRECHE:
        return "Creche";
    case TAB_REPAS:
        return "Repas";
    case TAB_METRO:
        return "Metro";
    case TAB_REGLAGES:
        return "Regl";
    case TAB_ISS:
        return "ISS";
    case TAB_AIR:
        return "Air";
    case TAB_AGENDA:
        return "Agenda";
    default:
        return "aucun";
    }
}

inline const char *navSerialName(NavTabId tab)
{
    switch (tab) {
    case TAB_LISTES:
        return "Listes";
    case TAB_METEO:
        return "Météo";
    case TAB_CRECHE:
        return "Crèche";
    case TAB_REPAS:
        return "Repas";
    case TAB_METRO:
        return "Métro";
    case TAB_REGLAGES:
        return "Réglages";
    case TAB_ISS:
        return "ISS";
    case TAB_AIR:
        return "Air";
    case TAB_AGENDA:
        return "Agenda";
    default:
        return "aucun";
    }
}

inline const char *navPageTitle(NavTabId tab)
{
    switch (tab) {
    case TAB_LISTES:
        return "LISTES";
    case TAB_METEO:
        return "METEO";
    case TAB_CRECHE:
        return "CRECHE";
    case TAB_REPAS:
        return "REPAS";
    case TAB_METRO:
        return "METRO";
    case TAB_REGLAGES:
        return "REGLAGES";
    case TAB_ISS:
        return "ISS";
    case TAB_AIR:
        return "AIR";
    case TAB_AGENDA:
        return "AGENDA";
    default:
        return "LISTES";
    }
}

inline const char *navApiKey(NavTabId tab)
{
    switch (tab) {
    case TAB_LISTES:
        return "listes";
    case TAB_METEO:
        return "meteo";
    case TAB_CRECHE:
        return "creche";
    case TAB_REPAS:
        return "repas";
    case TAB_METRO:
        return "metro";
    case TAB_REGLAGES:
        return "reglages";
    case TAB_ISS:
        return "iss";
    case TAB_AIR:
        return "air";
    case TAB_AGENDA:
        return "agenda";
    default:
        return "listes";
    }
}

inline NavTabId navTabFromApiKey(const char *key)
{
    if (!key) return TAB_NONE;
    if (strcmp(key, "listes") == 0) return TAB_LISTES;
    if (strcmp(key, "meteo") == 0) return TAB_METEO;
    if (strcmp(key, "creche") == 0) return TAB_CRECHE;
    if (strcmp(key, "repas") == 0) return TAB_REPAS;
    if (strcmp(key, "metro") == 0) return TAB_METRO;
    if (strcmp(key, "reglages") == 0 || strcmp(key, "settings") == 0) return TAB_REGLAGES;
    if (strcmp(key, "iss") == 0) return TAB_ISS;
    if (strcmp(key, "air") == 0 || strcmp(key, "traffic-aerien") == 0) return TAB_AIR;
    if (strcmp(key, "agenda") == 0 || strcmp(key, "calendrier") == 0) return TAB_AGENDA;
    return TAB_NONE;
}
