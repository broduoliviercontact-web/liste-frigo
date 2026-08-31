#pragma once

#include <Arduino.h>
#include "epd_driver.h"

constexpr int32_t LOGICAL_WIDTH = EPD_HEIGHT;   // 540
constexpr int32_t LOGICAL_HEIGHT = EPD_WIDTH;   // 960
constexpr size_t FRAMEBUFFER_BYTES = EPD_WIDTH * EPD_HEIGHT / 2;
constexpr int8_t NAV_TAB_COUNT = 6;
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

enum NavTabId : int8_t {
    TAB_LISTES = 0,
    TAB_METEO = 1,
    TAB_CRECHE = 2,
    TAB_TENUES = 3,
    TAB_VELIB = 4,
    TAB_TRANSP = 5,
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
    case TAB_TENUES:
        return "Tenues";
    case TAB_VELIB:
        return "Velib";
    case TAB_TRANSP:
        return "Transp";
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
    case TAB_TENUES:
        return "Tenues";
    case TAB_VELIB:
        return "Vélib";
    case TAB_TRANSP:
        return "Transp.";
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
    case TAB_TENUES:
        return "TENUES";
    case TAB_VELIB:
        return "VELIB";
    case TAB_TRANSP:
        return "TRANSP";
    default:
        return "LISTES";
    }
}
