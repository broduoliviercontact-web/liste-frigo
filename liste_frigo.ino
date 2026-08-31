/**
 * Liste Frigo - local e-paper prototype.
 *
 * Static portrait UI, GT911 navigation, Wi-Fi and API logging, no deep sleep.
 */

#ifndef BOARD_HAS_PSRAM
#error "Please enable PSRAM !!!"
#endif

#include <Arduino.h>
#include <Preferences.h>
#include <SensorPCF8563.hpp>
#include "utilities.h"
#include "ListeFrigoDisplay.h"
#include "ListeFrigoTouch.h"
#include "ListeFrigoWifi.h"
#include "ListeFrigoApi.h"

constexpr uint32_t CHECKBOX_REFRESH_IDLE_MS = 800;
constexpr uint32_t SCROLL_REFRESH_IDLE_MS = 900;

ListeFrigoDisplay display;
ListeFrigoTouch touch_nav;
ListeFrigoWifi wifi;
ListeFrigoApi api;
Preferences preferences;
SensorPCF8563 rtc;
bool rtc_online = false;
int8_t weather_display_hour = -1;
uint32_t next_weather_clock_poll_ms = 0;
NavTabId active_tab = TAB_LISTES;
uint32_t last_preview_ms = 0;
bool keyboard_open = false;
bool keyboard_extra_page = false;
char keyboard_value[LIST_LABEL_MAX] = {0};
bool keyboard_preview_dirty = false;
uint32_t keyboard_preview_due_ms = 0;
bool list_preview_dirty = false;
uint8_t list_preview_rows_mask = 0;
uint32_t list_preview_due_ms = 0;
volatile bool display_busy = false;
volatile bool display_ready = false;
volatile uint32_t display_completed_ms = 0;
TaskHandle_t display_task = nullptr;
char keyboard_display_value[LIST_LABEL_MAX] = {0};
ListPageState list_display_state = {};
uint8_t list_display_rows_mask = 0;
ListPageState page_display_state = {};
NavTabId page_display_tab = TAB_LISTES;
bool page_display_keyboard = false;
bool page_display_keyboard_extra = false;
char page_display_keyboard_value[LIST_LABEL_MAX] = {0};
bool page_display_pending = false;
bool page_display_list_picker = false;
ListPageState render_page_state = {};
NavTabId render_page_tab = TAB_LISTES;
bool render_page_keyboard = false;
bool render_page_keyboard_extra = false;
char render_page_keyboard_value[LIST_LABEL_MAX] = {0};
bool render_page_list_picker = false;
bool list_picker_open = false;
int32_t selected_list_id = 1;
bool list_scroll_dirty = false;
uint32_t last_scroll_input_ms = 0;
int8_t displayed_scroll_offset = -1;
uint32_t display_requests_count = 0;
uint32_t display_refresh_count = 0;
uint32_t display_coalesced_count = 0;
uint32_t checkbox_interactions_count = 0;
uint32_t checkbox_refreshes_count = 0;
uint32_t checkbox_coalesced_count = 0;
uint32_t scroll_interactions_count = 0;
uint32_t scroll_refreshes_count = 0;
uint32_t scroll_coalesced_count = 0;
uint32_t scroll_refresh_total_ms = 0;

enum DeferredDisplayJob : int8_t {
    DISPLAY_JOB_NONE,
    DISPLAY_JOB_KEYBOARD,
    DISPLAY_JOB_LIST_TOGGLES,
    DISPLAY_JOB_LIST_WINDOW,
    DISPLAY_JOB_PAGE,
    DISPLAY_JOB_INIT,
};

volatile DeferredDisplayJob display_job = DISPLAY_JOB_NONE;

enum KeyboardExitAction : int8_t {
    KEYBOARD_EXIT_NONE,
    KEYBOARD_EXIT_CANCEL,
    KEYBOARD_EXIT_ADD,
};

KeyboardExitAction keyboard_exit_action = KEYBOARD_EXIT_NONE;
char keyboard_submit_value[LIST_LABEL_MAX] = {0};
ListPageState list_state = {
    1,
    "Courses",
    {
        {1, "Courses"},
    },
    1,
    {
        {1, "Tomates", false},
        {2, "sucre", false},
        {3, "poivre", false},
        {4, "couches", false},
        {5, "citron", false},
        {6, "lait", false},
        {7, "sel", false},
        {8, "eau", false},
        {9, "pain", false},
        {10, "savon", false},
    },
    10,
    0,
};
WeatherState weather_state = {};
MealWeekState meal_week_state = {};

int8_t daysInMonth(int year, int month)
{
    static const int8_t days[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if (month == 2 && (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0))) {
        return 29;
    }
    return days[month - 1];
}

int8_t dayOfWeek(int year, int month, int day)
{
    static const int8_t month_offsets[] = {0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4};
    year -= month < 3;
    return (year + year / 4 - year / 100 + year / 400 + month_offsets[month - 1] + day) % 7;
}

int8_t lastSundayOfMonth(int year, int month)
{
    const int8_t last_day = daysInMonth(year, month);
    return last_day - dayOfWeek(year, month, last_day);
}

bool isParisSummerTime(int year, int month, int day, int hour_utc)
{
    if (month < 3 || month > 10) {
        return false;
    }
    if (month > 3 && month < 10) {
        return true;
    }
    const int8_t transition_day = lastSundayOfMonth(year, month);
    return month == 3 ? (day > transition_day || (day == transition_day && hour_utc >= 1))
                      : (day < transition_day || (day == transition_day && hour_utc < 1));
}

void addHoursToDate(int &year, int &month, int &day, int &hour, int hours)
{
    hour += hours;
    while (hour >= 24) {
        hour -= 24;
        ++day;
        if (day > daysInMonth(year, month)) {
            day = 1;
            ++month;
            if (month > 12) {
                month = 1;
                ++year;
            }
        }
    }
}

bool refreshWeatherClock()
{
    if (!rtc_online) {
        display.setWeatherTime(0, 0, false);
        return false;
    }

    const RTC_DateTime now = rtc.getDateTime();
    const bool valid = now.getYear() >= 2024 && now.getHour() < 24 && now.getMinute() < 60;
    display.setWeatherTime(now.getHour(), now.getMinute(), valid);
    return valid;
}

bool syncRtcFromGeneratedAt(const char *generated_at)
{
    int year = 0;
    int month = 0;
    int day = 0;
    int hour = 0;
    int minute = 0;
    int second = 0;
    if (!rtc_online || !generated_at ||
        sscanf(generated_at, "%d-%d-%dT%d:%d:%d", &year, &month, &day, &hour, &minute, &second) != 6) {
        return false;
    }

    addHoursToDate(year, month, day, hour, isParisSummerTime(year, month, day, hour) ? 2 : 1);
    rtc.setDateTime(year, month, day, hour, minute, second);
    Serial.printf("RTC: synchronise depuis API %02d:%02d\n", hour, minute);
    return true;
}

void pollWeatherClock()
{
    if (millis() < next_weather_clock_poll_ms) {
        return;
    }
    next_weather_clock_poll_ms = millis() + 30000;
    if (!refreshWeatherClock() || active_tab != TAB_METEO) {
        return;
    }

    const RTC_DateTime now = rtc.getDateTime();
    if (weather_display_hour != now.getHour()) {
        requestPageDisplay(TAB_METEO, list_state, "heure meteo");
    }
}

void previewPrintEscaped(const char *text)
{
    while (*text) {
        if (*text == '"' || *text == '\\') {
            Serial.print('\\');
        }
        Serial.print(*text++);
    }
}

void emitPreviewState(const char *reason)
{
    last_preview_ms = millis();
    Serial.print("PREVIEW:{\"reason\":\"");
    previewPrintEscaped(reason);
    Serial.print("\",\"tab\":\"");
    Serial.print(navAsciiName(active_tab));
    Serial.print("\",\"listId\":");
    Serial.print(list_state.id);
    Serial.print(",\"listName\":\"");
    previewPrintEscaped(list_state.name);
    Serial.print("\",\"itemCount\":");
    Serial.print(list_state.item_count);
    Serial.print(",\"scrollOffset\":");
    Serial.print(list_state.scroll_offset);
    Serial.print(",\"visibleRows\":");
    Serial.print(VISIBLE_LIST_ROWS);
    Serial.print(",\"items\":[");
    for (int8_t i = 0; i < list_state.item_count; ++i) {
        if (i > 0) {
            Serial.print(',');
        }
        Serial.print("{\"id\":");
        Serial.print(list_state.items[i].id);
        Serial.print(",\"label\":\"");
        previewPrintEscaped(list_state.items[i].label);
        Serial.print("\",\"checked\":");
        Serial.print(list_state.items[i].checked ? "true" : "false");
        Serial.print('}');
    }
    Serial.println("]}");
}

bool sameListState(const ListPageState &a, const ListPageState &b)
{
    if (a.id != b.id || a.item_count != b.item_count || a.list_count != b.list_count) {
        return false;
    }
    if (strcmp(a.name, b.name) != 0) {
        return false;
    }
    for (int8_t i = 0; i < a.item_count; ++i) {
        if (a.items[i].id != b.items[i].id || a.items[i].checked != b.items[i].checked || strcmp(a.items[i].label, b.items[i].label) != 0) {
            return false;
        }
    }
    for (int8_t i = 0; i < a.list_count; ++i) {
        if (a.lists[i].id != b.lists[i].id || strcmp(a.lists[i].name, b.lists[i].name) != 0) {
            return false;
        }
    }
    return true;
}

bool sameWeatherState(const WeatherState &a, const WeatherState &b)
{
    if (a.available != b.available || a.current_temperature != b.current_temperature ||
        a.current_weather_code != b.current_weather_code || a.current_is_day != b.current_is_day ||
        a.today_min != b.today_min || a.today_max != b.today_max ||
        a.tomorrow_min != b.tomorrow_min || a.tomorrow_max != b.tomorrow_max ||
        a.tomorrow_weather_code != b.tomorrow_weather_code || a.hourly_count != b.hourly_count ||
        a.departure.available != b.departure.available || a.departure.temperature != b.departure.temperature ||
        a.departure.weather_code != b.departure.weather_code || a.departure.is_day != b.departure.is_day ||
        a.return_forecast.available != b.return_forecast.available ||
        a.return_forecast.temperature != b.return_forecast.temperature ||
        a.return_forecast.weather_code != b.return_forecast.weather_code ||
        a.return_forecast.is_day != b.return_forecast.is_day) {
        return false;
    }
    for (int8_t i = 0; i < a.hourly_count; ++i) {
        if (a.hourly[i].hour != b.hourly[i].hour || a.hourly[i].temperature != b.hourly[i].temperature ||
            a.hourly[i].weather_code != b.hourly[i].weather_code || a.hourly[i].is_day != b.hourly[i].is_day) {
            return false;
        }
    }
    return true;
}

bool sameMealWeekState(const MealWeekState &a, const MealWeekState &b)
{
    if (a.available != b.available || a.meal_count != b.meal_count) return false;
    for (int8_t i = 0; i < a.meal_count; ++i) {
        if (a.meals[i].day_index != b.meals[i].day_index || a.meals[i].lunch != b.meals[i].lunch ||
            strcmp(a.meals[i].label, b.meals[i].label) != 0) return false;
    }
    return true;
}

void applyApiListState()
{
    char generated_at[32] = {0};
    if (api.takeGeneratedAt(generated_at, sizeof(generated_at)) && syncRtcFromGeneratedAt(generated_at)) {
        const RTC_DateTime now = rtc.getDateTime();
        if (active_tab == TAB_METEO && weather_display_hour != now.getHour()) {
            requestPageDisplay(TAB_METEO, list_state, "horloge API");
        }
    }

    WeatherState remote_weather = {};
    if (api.takeWeatherState(remote_weather)) {
        const bool weather_changed = !sameWeatherState(weather_state, remote_weather);
        weather_state = remote_weather;
        display.setWeatherState(weather_state);
        Serial.printf("METEO: recue %s, heures=%d\n", weather_state.location, weather_state.hourly_count);
        if (weather_changed && (active_tab == TAB_METEO || active_tab == TAB_CRECHE)) {
            requestPageDisplay(active_tab, list_state, "meteo actualisee");
        }
    }

    MealWeekState remote_meal_week = {};
    if (api.takeMealWeekState(remote_meal_week)) {
        const bool meals_changed = !sameMealWeekState(meal_week_state, remote_meal_week);
        meal_week_state = remote_meal_week;
        display.setMealWeekState(meal_week_state);
        Serial.printf("REPAS: recus, entrees=%d\n", meal_week_state.meal_count);
        if (meals_changed && active_tab == TAB_REPAS) {
            requestPageDisplay(TAB_REPAS, list_state, "repas actualises");
        }
    }

    ListPageState remote_state = {};
    if (!api.takeListState(remote_state)) {
        return;
    }

    // A GET can be older than a locally queued POST. Preserve the latest local intent.
    api.mergePendingToggles(remote_state);

    const bool selected_list_received = list_picker_open && remote_state.id == selected_list_id;
    if (sameListState(list_state, remote_state)) {
        if (selected_list_received) {
            list_picker_open = false;
            requestPageDisplay(TAB_LISTES, list_state, "liste selectionnee");
        }
        Serial.println("API: liste recue sans changement");
        return;
    }

    const int8_t max_offset = max<int8_t>(0, remote_state.item_count - VISIBLE_LIST_ROWS);
    remote_state.scroll_offset = min<int8_t>(list_state.scroll_offset, max_offset);
    list_state = remote_state;
    Serial.printf("API: liste appliquee localement, items=%d\n", list_state.item_count);

    if (selected_list_received) {
        list_picker_open = false;
    }
    if (active_tab == TAB_LISTES && !keyboard_open) {
        Serial.println("API: changement site detecte, affichage programme");
        requestPageDisplay(active_tab, list_state, "api");
        emitPreviewState("api");
    }
}

bool isKeyboardButtonAt(int16_t logical_x, int16_t logical_y)
{
    return logical_x >= 62 && logical_x <= 264 && logical_y >= 724 && logical_y <= 770;
}

char keyboardLetterAt(int16_t logical_x, int16_t logical_y)
{
    const char *rows[] = {
        keyboard_extra_page ? "uiop" : "azerty",
        keyboard_extra_page ? "jklm" : "qsdfgh",
        keyboard_extra_page ? "-/" : "wxcvbn",
    };
    const int16_t row_x = keyboard_extra_page ? 126 : 54;
    int8_t row = -1;
    if (logical_y >= 250 && logical_y < 326) {
        row = 0;
    } else if (logical_y >= 340 && logical_y < 416) {
        row = 1;
    } else if (logical_y >= 430 && logical_y < 506) {
        row = 2;
    }
    if (row < 0 || logical_x < row_x || (logical_x - row_x) % 72 >= 68) {
        return 0;
    }
    const int8_t index = (logical_x - row_x) / 72;
    return index >= 0 && index < strlen(rows[row]) ? rows[row][index] : 0;
}

void scheduleKeyboardPreview()
{
    ++display_requests_count;
    if (keyboard_preview_dirty) {
        ++display_coalesced_count;
    }
    keyboard_preview_dirty = true;
    keyboard_preview_due_ms = millis() + 1200;
}

void requestPageDisplay(NavTabId tab, const ListPageState &state, const char *reason)
{
    ++display_requests_count;
    if (page_display_pending) {
        ++display_coalesced_count;
        Serial.printf("DISPLAY request superseded: %s -> %s\n", navSerialName(page_display_tab), navSerialName(tab));
    }
    page_display_tab = tab;
    if (tab == TAB_METEO) {
        refreshWeatherClock();
        display.setWeatherState(weather_state);
        weather_display_hour = rtc_online ? rtc.getDateTime().getHour() : -1;
    }
    page_display_state = state;
    page_display_keyboard = false;
    page_display_list_picker = false;
    page_display_pending = true;
    list_preview_dirty = false;
    list_preview_rows_mask = 0;
    list_scroll_dirty = false;
    Serial.printf("DISPLAY page requested: %s @ %lu (%s)\n", navSerialName(tab), static_cast<unsigned long>(millis()), reason);
}

void requestListPickerDisplay(const ListPageState &state)
{
    ++display_requests_count;
    page_display_state = state;
    page_display_keyboard = false;
    page_display_list_picker = true;
    page_display_pending = true;
    Serial.printf("DISPLAY choix listes requested @ %lu\n", static_cast<unsigned long>(millis()));
}

void requestKeyboardPageDisplay(const ListPageState &state, const char *value, bool extra_page)
{
    ++display_requests_count;
    if (page_display_pending) {
        ++display_coalesced_count;
    }
    page_display_state = state;
    page_display_keyboard = true;
    page_display_list_picker = false;
    page_display_keyboard_extra = extra_page;
    strlcpy(page_display_keyboard_value, value, sizeof(page_display_keyboard_value));
    page_display_pending = true;
    keyboard_preview_dirty = false;
    Serial.printf("DISPLAY clavier page requested @ %lu\n", static_cast<unsigned long>(millis()));
}

void scheduleListPreview(int8_t visible_row)
{
    if (visible_row < 0 || visible_row >= VISIBLE_LIST_ROWS) {
        return;
    }
    ++checkbox_interactions_count;
    ++display_requests_count;
    if (list_preview_dirty) {
        ++display_coalesced_count;
        ++checkbox_coalesced_count;
    }
    list_preview_dirty = true;
    list_preview_rows_mask |= 1U << visible_row;
    list_preview_due_ms = millis() + CHECKBOX_REFRESH_IDLE_MS;
}

void displayTask(void *)
{
    while (true) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
        const uint32_t started_ms = millis();
        if (display_job == DISPLAY_JOB_INIT) {
            display_ready = display.begin();
            Serial.println(display_ready ? "DISPLAY initialise" : "DISPLAY erreur initialisation");
        } else if (display_job == DISPLAY_JOB_KEYBOARD) {
            Serial.printf("DISPLAY clavier START: %lu ms\n", static_cast<unsigned long>(started_ms));
            display.updateKeyboardValue(keyboard_display_value);
            Serial.printf("DISPLAY clavier END: %lu ms | duree %lu ms\n",
                          static_cast<unsigned long>(millis()),
                          static_cast<unsigned long>(millis() - started_ms));
        } else if (display_job == DISPLAY_JOB_LIST_TOGGLES) {
            Serial.printf("DISPLAY coches START: %lu ms\n", static_cast<unsigned long>(started_ms));
            display.updateListItemToggles(list_display_rows_mask, list_display_state);
            ++checkbox_refreshes_count;
            Serial.printf("DISPLAY coches END: %lu ms | duree %lu ms\n",
                          static_cast<unsigned long>(millis()),
                          static_cast<unsigned long>(millis() - started_ms));
        } else if (display_job == DISPLAY_JOB_LIST_WINDOW) {
            Serial.printf("DISPLAY liste START offset=%d @ %lu ms\n", list_display_state.scroll_offset,
                          static_cast<unsigned long>(started_ms));
            display.updateListWindow(list_display_state);
            const uint32_t duration_ms = millis() - started_ms;
            displayed_scroll_offset = list_display_state.scroll_offset;
            ++scroll_refreshes_count;
            scroll_refresh_total_ms += duration_ms;
            Serial.printf("DISPLAY liste END: %lu ms | duree %lu ms\n",
                          static_cast<unsigned long>(millis()),
                          static_cast<unsigned long>(duration_ms));
        } else if (display_job == DISPLAY_JOB_PAGE) {
            Serial.printf("DISPLAY page START: %s @ %lu ms\n", render_page_list_picker ? "CHOIX LISTES" : render_page_keyboard ? "CLAVIER" : navSerialName(render_page_tab), static_cast<unsigned long>(started_ms));
            if (render_page_list_picker) {
                display.showListPicker(render_page_state);
            } else if (render_page_keyboard) {
                display.showKeyboard(render_page_state, render_page_keyboard_value, render_page_keyboard_extra);
            } else {
                display.showPage(render_page_tab, true, &render_page_state);
                if (render_page_tab == TAB_LISTES) {
                    displayed_scroll_offset = render_page_state.scroll_offset;
                }
            }
            Serial.printf("DISPLAY page END: %lu ms | duree %lu ms\n",
                          static_cast<unsigned long>(millis()),
                          static_cast<unsigned long>(millis() - started_ms));
        }
        if (display_job != DISPLAY_JOB_INIT) {
            ++display_refresh_count;
        }
        Serial.printf("DISPLAY stats: requests=%lu refreshes=%lu coalesced=%lu\n",
                      static_cast<unsigned long>(display_requests_count),
                      static_cast<unsigned long>(display_refresh_count),
                      static_cast<unsigned long>(display_coalesced_count));
        Serial.printf("CHECKBOX stats: interactions=%lu refreshes=%lu coalesced=%lu\n",
                      static_cast<unsigned long>(checkbox_interactions_count),
                      static_cast<unsigned long>(checkbox_refreshes_count),
                      static_cast<unsigned long>(checkbox_coalesced_count));
        Serial.printf("SCROLL stats: interactions=%lu refreshes=%lu coalesced=%lu avg=%lu ms\n",
                      static_cast<unsigned long>(scroll_interactions_count),
                      static_cast<unsigned long>(scroll_refreshes_count),
                      static_cast<unsigned long>(scroll_coalesced_count),
                      static_cast<unsigned long>(scroll_refreshes_count == 0 ? 0 : scroll_refresh_total_ms / scroll_refreshes_count));
        display_job = DISPLAY_JOB_NONE;
        display_completed_ms = millis();
        display_busy = false;
        vTaskDelay(pdMS_TO_TICKS(1));
    }
}

void finishKeyboardExit()
{
    if (keyboard_exit_action == KEYBOARD_EXIT_NONE || display_busy) {
        return;
    }

    const KeyboardExitAction action = keyboard_exit_action;
    keyboard_exit_action = KEYBOARD_EXIT_NONE;
    keyboard_open = false;
    keyboard_preview_dirty = false;
    if (action == KEYBOARD_EXIT_ADD) {
        Serial.printf("Liste Frigo: ajout article=%s liste=%ld\n", keyboard_submit_value, static_cast<long>(list_state.id));
        const bool sent = api.sendAddItem(list_state.id, keyboard_submit_value);
        requestPageDisplay(TAB_LISTES, list_state, "keyboard add");
        emitPreviewState(sent ? "keyboard_add" : "keyboard_add_failed");
        keyboard_submit_value[0] = '\0';
    } else {
        requestPageDisplay(TAB_LISTES, list_state, "keyboard cancel");
        emitPreviewState("keyboard_cancel");
        Serial.println("Liste Frigo: clavier annule");
    }
    keyboard_value[0] = '\0';
}

void appendKeyboardCharacter(char character)
{
    const size_t value_length = strlen(keyboard_value);
    if (value_length >= sizeof(keyboard_value) - 1) {
        Serial.println("Liste Frigo: clavier limite de caracteres atteinte");
        return;
    }
    keyboard_value[value_length] = character;
    keyboard_value[value_length + 1] = '\0';
    Serial.printf("KEY buffer updated: %lu ms | %s\n", static_cast<unsigned long>(millis()), keyboard_value);
    scheduleKeyboardPreview();
}

void removeKeyboardCharacter()
{
    const size_t length = strlen(keyboard_value);
    if (length == 0) {
        return;
    }
    keyboard_value[length - 1] = '\0';
    Serial.printf("KEY buffer updated: %lu ms | %s\n", static_cast<unsigned long>(millis()), keyboard_value);
    scheduleKeyboardPreview();
}

bool handleKeyboardGesture(const TouchEvent &event)
{
    if (!keyboard_open) {
        return false;
    }
    if (keyboard_exit_action != KEYBOARD_EXIT_NONE) {
        return true;
    }
    if (event.kind != TOUCH_TAP) {
        return true;
    }

    Serial.printf("KEY touch detected: %lu ms\n", static_cast<unsigned long>(millis()));
    const char letter = keyboardLetterAt(event.logical_x, event.logical_y);
    if (letter) {
        appendKeyboardCharacter(letter);
        return true;
    }
    if (event.logical_y >= 534 && event.logical_y < 588) {
        if (event.logical_x >= 62 && event.logical_x <= 194) {
            appendKeyboardCharacter(' ');
        } else if (event.logical_x >= 204 && event.logical_x <= 336) {
            removeKeyboardCharacter();
        } else if (event.logical_x >= 346 && event.logical_x <= 478) {
            keyboard_extra_page = !keyboard_extra_page;
            requestKeyboardPageDisplay(list_state, keyboard_value, keyboard_extra_page);
        }
        return true;
    }
    if (event.logical_y >= 612 && event.logical_y < 666) {
        if (event.logical_x >= 62 && event.logical_x <= 264) {
            keyboard_exit_action = KEYBOARD_EXIT_CANCEL;
        } else if (event.logical_x >= 276 && event.logical_x <= 478) {
            if (!keyboard_value[0]) {
                Serial.println("Liste Frigo: clavier ajout ignore, texte vide");
                return true;
            }
            strlcpy(keyboard_submit_value, keyboard_value, sizeof(keyboard_submit_value));
            keyboard_exit_action = KEYBOARD_EXIT_ADD;
        }
        return true;
    }
    return true;
}

void logTouchEvent(const TouchEvent &event)
{
    Serial.printf(
        "Touch: physique x=%d y=%d | portrait x=%d y=%d | onglet=%s\n",
        event.physical_x,
        event.physical_y,
        event.logical_x,
        event.logical_y,
        navSerialName(event.tab)
    );
    Serial.printf(
        "Touch: geste=%s fin portrait x=%d y=%d deltaY=%d\n",
        touchKindName(event.kind),
        event.logical_end_x,
        event.logical_end_y,
        event.delta_y
    );
}

void logTiming(const char *label, uint32_t start_ms)
{
    Serial.printf("Perf: %s %lu ms\n", label, static_cast<unsigned long>(millis() - start_ms));
}

int8_t listItemAt(int16_t logical_x, int16_t logical_y)
{
    if (logical_x < 45 || logical_x > 120 || logical_y < LIST_TOP_Y || logical_y >= LIST_TOP_Y + LIST_ROW_HEIGHT * VISIBLE_LIST_ROWS) {
        return -1;
    }

    const int8_t row = (logical_y - LIST_TOP_Y) / LIST_ROW_HEIGHT;
    if (row < 0 || row >= VISIBLE_LIST_ROWS) {
        return -1;
    }

    const int8_t index = list_state.scroll_offset + row;
    return index < list_state.item_count ? index : -1;
}

int8_t scrollButtonDeltaAt(int16_t logical_x, int16_t logical_y)
{
    const int8_t max_offset = max<int8_t>(0, list_state.item_count - VISIBLE_LIST_ROWS);
    if (list_state.item_count <= VISIBLE_LIST_ROWS || max_offset <= 0) {
        return 0;
    }
    if (logical_y < 40 || logical_y > 120) {
        return 0;
    }
    if (list_state.scroll_offset > 0 && logical_x >= 376 && logical_x <= 428) {
        return -1;
    }
    if (list_state.scroll_offset < max_offset && logical_x >= 438 && logical_x <= 490) {
        return 1;
    }
    return 0;
}

bool isListSwitcherAt(int16_t logical_x, int16_t logical_y)
{
    return logical_x >= 48 && logical_x <= 370 && logical_y >= 30 && logical_y <= 136;
}

int32_t nextListId()
{
    if (list_state.list_count <= 1) {
        return 0;
    }

    int8_t current_index = 0;
    for (int8_t i = 0; i < list_state.list_count; ++i) {
        if (list_state.lists[i].id == list_state.id) {
            current_index = i;
            break;
        }
    }

    return list_state.lists[(current_index + 1) % list_state.list_count].id;
}

bool scrollListBy(int8_t delta)
{
    const int8_t max_offset = max<int8_t>(0, list_state.item_count - VISIBLE_LIST_ROWS);
    int8_t next_offset = list_state.scroll_offset + delta;
    if (next_offset < 0) {
        next_offset = 0;
    } else if (next_offset > max_offset) {
        next_offset = max_offset;
    }
    if (next_offset == list_state.scroll_offset) {
        Serial.println(delta > 0 ? "Liste Frigo: bouton bas sans effet" : "Liste Frigo: bouton haut sans effet");
        return false;
    }

    list_state.scroll_offset = next_offset;
    Serial.printf("Liste Frigo: scroll liste offset=%d\n", list_state.scroll_offset);
    ++display_requests_count;
    ++scroll_interactions_count;
    if (list_scroll_dirty) {
        ++display_coalesced_count;
        ++scroll_coalesced_count;
        Serial.println("SCROLL refresh deferred");
    }
    list_scroll_dirty = true;
    last_scroll_input_ms = millis();
    Serial.printf("SCROLL input offset=%d @ %lu\n", list_state.scroll_offset,
                  static_cast<unsigned long>(last_scroll_input_ms));
    emitPreviewState("scroll");
    return true;
}

bool handleListGesture(const TouchEvent &event)
{
    if (active_tab != TAB_LISTES) {
        return false;
    }

    const int8_t max_offset = max<int8_t>(0, list_state.item_count - VISIBLE_LIST_ROWS);

    if (event.kind == TOUCH_SWIPE_UP) {
        return scrollListBy(1);
    }

    if (event.kind == TOUCH_SWIPE_DOWN) {
        return scrollListBy(-1);
    }

    if (event.kind == TOUCH_TAP && isListSwitcherAt(event.logical_x, event.logical_y)) {
        const int32_t target_id = nextListId();
        if (target_id <= 0) {
            Serial.println("Liste Frigo: une seule liste, selection sans effet");
            return true;
        }
        Serial.printf("Liste Frigo: selection liste suivante id=%ld\n", static_cast<long>(target_id));
        api.sendSelectList(target_id);
        return true;
    }

    if (event.kind == TOUCH_TAP && isKeyboardButtonAt(event.logical_x, event.logical_y)) {
        keyboard_value[0] = '\0';
        keyboard_extra_page = false;
        keyboard_preview_dirty = false;
        keyboard_exit_action = KEYBOARD_EXIT_NONE;
        keyboard_open = true;
        requestKeyboardPageDisplay(list_state, keyboard_value, keyboard_extra_page);
        emitPreviewState("keyboard_open");
        return true;
    }

    const int8_t item_index = listItemAt(event.logical_x, event.logical_y);
    if (item_index < 0) {
        if (event.kind == TOUCH_TAP && event.logical_y >= LIST_TOP_Y && event.logical_y < LIST_TOP_Y + LIST_ROW_HEIGHT * VISIBLE_LIST_ROWS) {
            Serial.println("Liste Frigo: tap liste hors case, aucun cochage");
        }
        const int8_t scroll_delta = scrollButtonDeltaAt(event.logical_x, event.logical_y);
        if (event.kind == TOUCH_TAP && scroll_delta != 0) {
            Serial.println(scroll_delta > 0 ? "Liste Frigo: bouton BAS" : "Liste Frigo: bouton HAUT");
            return scrollListBy(scroll_delta);
        }
        return false;
    }

    list_state.items[item_index].checked = !list_state.items[item_index].checked;
    const bool checked = list_state.items[item_index].checked;
    Serial.printf(
        "Liste Frigo: item %s -> %s\n",
        list_state.items[item_index].label,
        checked ? "coche" : "decoche"
    );
    const int8_t visible_row = item_index - list_state.scroll_offset;
    scheduleListPreview(visible_row);
    Serial.printf("Liste Frigo: coche en attente affichage ligne=%d\n", visible_row);
    emitPreviewState("toggle");
    api.sendToggleItem(list_state.items[item_index].id, checked);
    return true;
}

int8_t listPickerIndexAt(int16_t logical_x, int16_t logical_y)
{
    if (logical_x < 52 || logical_x > 488 || logical_y < 166) {
        return -1;
    }
    const int8_t index = (logical_y - 166) / 84;
    const int16_t row_y = 166 + index * 84;
    return index >= 0 && index < list_state.list_count && logical_y <= row_y + 70 ? index : -1;
}

void handleReadOnlyTouch()
{
    TouchEvent event;
    if (!touch_nav.poll(event) || event.kind != TOUCH_TAP) {
        return;
    }

    logTouchEvent(event);
    if (event.logical_y >= 842) {
        const int8_t nav_index = min<int8_t>(3, max<int8_t>(0, event.logical_x / (LOGICAL_WIDTH / 4)));
        const NavTabId primary_tabs[] = {TAB_LISTES, TAB_CRECHE, TAB_METEO, TAB_REPAS};
        const NavTabId target_tab = primary_tabs[nav_index];
        if (target_tab != active_tab || list_picker_open) {
            active_tab = target_tab;
            list_picker_open = false;
            const char *reason = target_tab == TAB_METEO ? "navigation meteo"
                : target_tab == TAB_CRECHE ? "navigation creche"
                : target_tab == TAB_REPAS ? "navigation repas" : "navigation listes";
            const char *preview = target_tab == TAB_METEO ? "navigation_meteo"
                : target_tab == TAB_CRECHE ? "navigation_creche"
                : target_tab == TAB_REPAS ? "navigation_repas" : "navigation_listes";
            requestPageDisplay(active_tab, list_state, reason);
            emitPreviewState(preview);
            Serial.printf("Liste Frigo: navigation bas -> %s\n", navSerialName(target_tab));
        }
        return;
    }

    if (active_tab != TAB_LISTES) {
        return;
    }

    if (!list_picker_open) {
        if (event.logical_x >= 448 && event.logical_x <= 510 && event.logical_y >= 58 && event.logical_y <= 136) {
            list_picker_open = true;
            requestListPickerDisplay(list_state);
        }
        return;
    }

    if (event.logical_y < 140) {
        list_picker_open = false;
        requestPageDisplay(TAB_LISTES, list_state, "fermeture choix listes");
        return;
    }

    const int8_t index = listPickerIndexAt(event.logical_x, event.logical_y);
    if (index < 0) {
        return;
    }

    selected_list_id = list_state.lists[index].id;
    preferences.putInt("list-id", selected_list_id);
    api.setSelectedListId(selected_list_id);
    api.requestStateRefresh();
    Serial.printf("Liste Frigo: liste e-paper choisie id=%ld\n", static_cast<long>(selected_list_id));

    ListPageState cached_state = {};
    if (api.getCachedListState(selected_list_id, cached_state)) {
        list_picker_open = false;
        list_state = cached_state;
        requestPageDisplay(TAB_LISTES, list_state, "liste selectionnee cache");
        emitPreviewState("liste_selectionnee_cache");
        Serial.println("Liste Frigo: liste affichee immediatement depuis le cache");
        return;
    }

    Serial.println("Liste Frigo: cache indisponible, attente synchronisation");
}

void setup()
{
    Serial.begin(115200);
    delay(1000);
    Serial.println("Liste Frigo: demarrage");

    touch_nav.begin();
    rtc.begin(Wire);
    Wire.beginTransmission(0x51);
    rtc_online = Wire.endTransmission() == 0;
    if (rtc_online) {
        refreshWeatherClock();
        const RTC_DateTime now = rtc.getDateTime();
        Serial.printf("RTC: pret %02d:%02d\n", now.getHour(), now.getMinute());
    } else {
        Serial.println("RTC: indisponible");
    }
    preferences.begin("liste-frigo", false);
    selected_list_id = preferences.getInt("list-id", 1);
    api.setSelectedListId(selected_list_id);
    if (xTaskCreatePinnedToCore(displayTask, "display_deferred", 8192, nullptr, 1, &display_task, 0) != pdPASS) {
        Serial.println("Liste Frigo: erreur creation tache affichage differe");
        while (true) {
            delay(1000);
        }
    }
    display_job = DISPLAY_JOB_INIT;
    display_busy = true;
    xTaskNotifyGive(display_task);
    api.begin();
    requestPageDisplay(active_tab, list_state, "boot");
    emitPreviewState("boot");
    wifi.begin();
}

void loop()
{
    wifi.poll();
    api.poll(wifi.isConnected());
    applyApiListState();
    pollWeatherClock();

    finishKeyboardExit();

    if (display_ready && page_display_pending && !display_busy) {
        render_page_state = page_display_state;
        render_page_tab = page_display_tab;
        render_page_keyboard = page_display_keyboard;
        render_page_keyboard_extra = page_display_keyboard_extra;
        render_page_list_picker = page_display_list_picker;
        strlcpy(render_page_keyboard_value, page_display_keyboard_value, sizeof(render_page_keyboard_value));
        page_display_pending = false;
        display_job = DISPLAY_JOB_PAGE;
        display_busy = true;
        xTaskNotifyGive(display_task);
    } else if (!keyboard_open && list_scroll_dirty && !display_busy &&
               millis() - last_scroll_input_ms >= SCROLL_REFRESH_IDLE_MS) {
        if (displayed_scroll_offset == list_state.scroll_offset) {
            list_scroll_dirty = false;
            Serial.printf("SCROLL final offset=%d deja affiche, aucun refresh\n", list_state.scroll_offset);
        } else {
            list_display_state = list_state;
            list_scroll_dirty = false;
            display_job = DISPLAY_JOB_LIST_WINDOW;
            display_busy = true;
            xTaskNotifyGive(display_task);
        }
    }

    if (keyboard_open && keyboard_exit_action == KEYBOARD_EXIT_NONE && keyboard_preview_dirty && !display_busy && millis() >= keyboard_preview_due_ms) {
        strlcpy(keyboard_display_value, keyboard_value, sizeof(keyboard_display_value));
        keyboard_preview_dirty = false;
        display_job = DISPLAY_JOB_KEYBOARD;
        display_busy = true;
        Serial.printf("KEY buffer pret affichage: %s\n", keyboard_display_value);
        xTaskNotifyGive(display_task);
    }

    if (!keyboard_open && list_preview_dirty && !display_busy && millis() >= list_preview_due_ms &&
        millis() - display_completed_ms >= CHECKBOX_REFRESH_IDLE_MS) {
        list_display_state = list_state;
        list_display_rows_mask = list_preview_rows_mask;
        list_preview_dirty = false;
        list_preview_rows_mask = 0;
        display_job = DISPLAY_JOB_LIST_TOGGLES;
        display_busy = true;
        Serial.printf("Liste Frigo: coches bufferises masque=0x%02X\n", list_display_rows_mask);
        xTaskNotifyGive(display_task);
    }

    if (millis() - last_preview_ms > 5000) {
        emitPreviewState("heartbeat");
    }

    handleReadOnlyTouch();
    delay(10);
}
