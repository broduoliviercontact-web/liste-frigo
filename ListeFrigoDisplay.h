#pragma once

#include "ListeFrigoTypes.h"

class ListeFrigoDisplay {
public:
    bool begin();
    void showPage(NavTabId tab, bool clear_panel, const ListPageState *list_state = nullptr);
    void showListPicker(const ListPageState &list_state);
    void showKeyboard(const ListPageState &list_state, const char *value, bool extra_page);
    void setWeatherTime(uint8_t hour, uint8_t minute, bool valid);
    void setWeatherState(const WeatherState &state);
    void setMealWeekState(const MealWeekState &state);
    void updateKeyboardValue(const char *value);
    void updateListItemToggle(int8_t visible_row, const ListPageState &list_state);
    void updateListItemToggles(uint8_t visible_rows_mask, const ListPageState &list_state);
    void updateListWindow(const ListPageState &list_state);

private:
    uint8_t *logical_fb = nullptr;
    uint8_t *physical_fb = nullptr;
    uint8_t *partial_fb = nullptr;

    const ListPageState *current_list_state = nullptr;
    uint8_t weather_hour = 0;
    uint8_t weather_minute = 0;
    bool weather_time_valid = false;
    WeatherState weather_state = {};
    MealWeekState meal_week_state = {};

    void drawPage(NavTabId tab, const ListPageState *list_state);
    void drawHeader(NavTabId tab);
    void drawListesPage(const ListPageState *list_state);
    void drawWeatherPage();
    void drawCrechePage();
    void drawMealsPage();
    void drawListPickerPage(const ListPageState &list_state);
    void drawKeyboardPage(const ListPageState &list_state, const char *value, bool extra_page);
    void drawKeyboardValue(const char *value);
    void drawKeyboardKey(int32_t x, int32_t y, const char *label, int32_t width = 44);
    void drawSimplePage(NavTabId tab);
    void drawNavBar(NavTabId selected_tab);
    void drawPrimaryNavBar(NavTabId selected_tab);
    void drawNavItem(NavTabId tab, bool selected);
    void drawListItem(int32_t y, const char *label, bool checked);
    void drawReadOnlyListItem(int32_t y, int32_t height, const char *label, bool checked);
    void drawWeatherCloud(int32_t x, int32_t y, uint8_t gray, int32_t scale = 1);
    void drawWeatherSun(int32_t x, int32_t y, uint8_t gray, int32_t scale = 1);
    void drawWeatherHour(int32_t x, const char *hour, const char *temperature, int16_t weather_code, bool is_day, int32_t top_y);
    int8_t weatherTemperature(int8_t hour) const;
    bool weatherIsSunny(int8_t hour) const;
    const char *weatherLabel(int16_t weather_code) const;
    void drawWeatherIcon(int32_t x, int32_t y, int16_t weather_code, bool is_day, uint8_t gray, int32_t scale = 1);
    void drawWeatherRain(int32_t x, int32_t y, uint8_t gray, int32_t scale);
    void drawWeatherMoon(int32_t x, int32_t y, uint8_t gray, int32_t scale);
    void drawBabyAvatar(int32_t x, int32_t y);
    void drawBabyNavIcon(int32_t x, int32_t y, uint8_t gray);
    void drawMonochromeBitmap(int32_t x, int32_t y, int32_t width, int32_t height, const uint8_t *bits, uint8_t gray);
    void drawItemPictogram(int32_t x, int32_t y, int32_t size, const char *label);
    void drawListPickerRow(int32_t y, const ListSummary &list, bool selected);
    void drawRemainingCount(const ListPageState &list_state);
    void drawToggleCell(int32_t y, bool checked);
    void drawScrollButtons(const ListPageState &list_state);
    void drawActionButton(int32_t x, int32_t y, int32_t w, int32_t h, const char *label, bool filled);
    void drawCheckMark(int32_t x, int32_t y, uint8_t gray);
    void drawArrowButton(int32_t x, int32_t y, bool up, uint8_t gray);
    void updateLogicalArea(Rect_t logical_area);
    void copyLogicalAreaToPhysicalBuffer(Rect_t logical_area, Rect_t &physical_area);
    size_t packedBytes(int32_t width, int32_t height);
    void rotateLogicalToPhysical();
    void drawCenteredText(int32_t y, const char *text, int32_t scale, uint8_t gray);
    void drawText(int32_t x, int32_t y, const char *text, int32_t scale, uint8_t gray);
    void drawTextLimited(int32_t x, int32_t y, const char *text, int32_t scale, uint8_t gray, int32_t max_width);
    void drawRect(int32_t x, int32_t y, int32_t w, int32_t h, int32_t stroke, uint8_t gray);
    void fillRect(int32_t x, int32_t y, int32_t w, int32_t h, uint8_t gray);
    void drawPixel(int32_t x, int32_t y, uint8_t gray);
    void setNibble(uint8_t *fb, int32_t width, int32_t x, int32_t y, uint8_t gray);
    uint8_t getNibble(const uint8_t *fb, int32_t width, int32_t x, int32_t y);
    int32_t textWidth(const char *text, int32_t scale);
};
