#include "ListeFrigoDisplay.h"
#include "ListeFrigoCesarAvatar.h"

namespace {

constexpr uint8_t BLACK = 0x00;
constexpr uint8_t DARK = 0x33;
constexpr uint8_t LIGHT = 0xDD;
constexpr uint8_t WHITE = 0xFF;

const uint8_t GLYPH_SPACE[7] = {
    0b00000,
    0b00000,
    0b00000,
    0b00000,
    0b00000,
    0b00000,
    0b00000,
};

struct Glyph {
    char c;
    uint8_t rows[7];
};

const Glyph FONT[] = {
    {'A', {0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001}},
    {'B', {0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110}},
    {'C', {0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111}},
    {'D', {0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110}},
    {'E', {0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111}},
    {'F', {0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000}},
    {'G', {0b01111, 0b10000, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110}},
    {'H', {0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001}},
    {'I', {0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111}},
    {'J', {0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100}},
    {'K', {0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001}},
    {'L', {0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111}},
    {'M', {0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001}},
    {'N', {0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001}},
    {'O', {0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110}},
    {'P', {0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000}},
    {'Q', {0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101}},
    {'R', {0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001}},
    {'S', {0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110}},
    {'T', {0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100}},
    {'U', {0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110}},
    {'V', {0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100}},
    {'W', {0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010}},
    {'X', {0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001}},
    {'Y', {0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100}},
    {'Z', {0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111}},
    {'0', {0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110}},
    {'1', {0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110}},
    {'2', {0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111}},
    {'3', {0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110}},
    {'4', {0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010}},
    {'5', {0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110}},
    {'6', {0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110}},
    {'7', {0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000}},
    {'8', {0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110}},
    {'9', {0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100}},
    {'-', {0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000}},
    {':', {0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000}},
    {'/', {0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000}},
    {'>', {0b10000, 0b01000, 0b00100, 0b00010, 0b00100, 0b01000, 0b10000}},
    {'a', {0b00000, 0b00000, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111}},
    {'b', {0b10000, 0b10000, 0b10110, 0b11001, 0b10001, 0b11001, 0b10110}},
    {'c', {0b00000, 0b00000, 0b01111, 0b10000, 0b10000, 0b10000, 0b01111}},
    {'d', {0b00001, 0b00001, 0b01101, 0b10011, 0b10001, 0b10011, 0b01101}},
    {'e', {0b00000, 0b00000, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110}},
    {'f', {0b00110, 0b01001, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000}},
    {'g', {0b00000, 0b00000, 0b01101, 0b10011, 0b01111, 0b00001, 0b01110}},
    {'h', {0b10000, 0b10000, 0b10110, 0b11001, 0b10001, 0b10001, 0b10001}},
    {'i', {0b00100, 0b00000, 0b01100, 0b00100, 0b00100, 0b00100, 0b01110}},
    {'j', {0b00010, 0b00000, 0b00110, 0b00010, 0b00010, 0b10010, 0b01100}},
    {'k', {0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001}},
    {'l', {0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110}},
    {'m', {0b00000, 0b00000, 0b11010, 0b10101, 0b10101, 0b10101, 0b10101}},
    {'n', {0b00000, 0b00000, 0b10110, 0b11001, 0b10001, 0b10001, 0b10001}},
    {'o', {0b00000, 0b00000, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110}},
    {'p', {0b00000, 0b00000, 0b11110, 0b10001, 0b11110, 0b10000, 0b10000}},
    {'q', {0b00000, 0b00000, 0b01101, 0b10011, 0b01111, 0b00001, 0b00001}},
    {'r', {0b00000, 0b00000, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000}},
    {'s', {0b00000, 0b00000, 0b01111, 0b10000, 0b01110, 0b00001, 0b11110}},
    {'t', {0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00101, 0b00010}},
    {'u', {0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b10011, 0b01101}},
    {'v', {0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100}},
    {'w', {0b00000, 0b00000, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010}},
    {'x', {0b00000, 0b00000, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001}},
    {'y', {0b00000, 0b00000, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110}},
    {'z', {0b00000, 0b00000, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111}},
};

const uint8_t *glyphFor(char c)
{
    if (c == ' ') {
        return GLYPH_SPACE;
    }
    for (const Glyph &glyph : FONT) {
        if (glyph.c == c) {
            return glyph.rows;
        }
    }
    return GLYPH_SPACE;
}

enum ItemPictogram : uint8_t {
    PICTO_BASKET,
    PICTO_BREAD,
    PICTO_MILK,
    PICTO_FRUIT,
    PICTO_VEGETABLE,
    PICTO_PANTRY,
    PICTO_BABY,
    PICTO_HOME,
};

bool labelContains(const char *label, const char *needle)
{
    if (!label || !needle || !*needle) {
        return false;
    }
    for (const char *start = label; *start; ++start) {
        const char *a = start;
        const char *b = needle;
        while (*a && *b && tolower(static_cast<unsigned char>(*a)) == tolower(static_cast<unsigned char>(*b))) {
            ++a;
            ++b;
        }
        if (!*b) {
            return true;
        }
    }
    return false;
}

ItemPictogram pictogramForLabel(const char *label)
{
    if (labelContains(label, "pain") || labelContains(label, "baguette") || labelContains(label, "croissant")) return PICTO_BREAD;
    if (labelContains(label, "lait")) return PICTO_MILK;
    if (labelContains(label, "pomme") || labelContains(label, "banane") || labelContains(label, "orange") ||
        labelContains(label, "citron") || labelContains(label, "fraise") || labelContains(label, "raisin")) return PICTO_FRUIT;
    if (labelContains(label, "tomate") || labelContains(label, "carotte") || labelContains(label, "poivron") ||
        labelContains(label, "courgette") || labelContains(label, "concombre") || labelContains(label, "salade") ||
        labelContains(label, "oignon") || labelContains(label, "ail")) return PICTO_VEGETABLE;
    if (labelContains(label, "couche") || labelContains(label, "lingette")) return PICTO_BABY;
    if (labelContains(label, "savon") || labelContains(label, "lessive") || labelContains(label, "eponge") ||
        labelContains(label, "papier") || labelContains(label, "dentifrice")) return PICTO_HOME;
    if (labelContains(label, "sucre") || labelContains(label, "poivre") || labelContains(label, "sel") ||
        labelContains(label, "cafe") || labelContains(label, "riz") || labelContains(label, "pate") ||
        labelContains(label, "farine") || labelContains(label, "chocolat")) return PICTO_PANTRY;
    return PICTO_BASKET;
}

} // namespace

bool ListeFrigoDisplay::begin()
{
    Serial.println("Liste Frigo: allocation du framebuffer");
    logical_fb = static_cast<uint8_t *>(ps_calloc(FRAMEBUFFER_BYTES, sizeof(uint8_t)));
    physical_fb = static_cast<uint8_t *>(ps_calloc(FRAMEBUFFER_BYTES, sizeof(uint8_t)));
    partial_fb = static_cast<uint8_t *>(ps_calloc(FRAMEBUFFER_BYTES, sizeof(uint8_t)));
    if (!logical_fb || !physical_fb || !partial_fb) {
        Serial.println("Liste Frigo: erreur allocation framebuffer");
        return false;
    }

    epd_init();
    return true;
}

void ListeFrigoDisplay::setWeatherTime(uint8_t hour, uint8_t minute, bool valid)
{
    weather_hour = hour;
    weather_minute = minute;
    weather_time_valid = valid;
}

void ListeFrigoDisplay::setWeatherState(const WeatherState &state)
{
    weather_state = state;
}

void ListeFrigoDisplay::showPage(NavTabId tab, bool clear_panel, const ListPageState *list_state)
{
    Serial.printf("Liste Frigo: affichage page %s\n", navSerialName(tab));
    drawPage(tab, list_state);
    rotateLogicalToPhysical();

    epd_poweron();
    if (clear_panel) {
        epd_clear();
    }
    epd_draw_grayscale_image(epd_full_screen(), physical_fb);
    epd_poweroff_all();
    Serial.println("Liste Frigo: affichage termine");
}

void ListeFrigoDisplay::showListPicker(const ListPageState &list_state)
{
    Serial.println("Liste Frigo: affichage choix liste");
    memset(logical_fb, 0xFF, FRAMEBUFFER_BYTES);
    current_list_state = &list_state;
    drawListPickerPage(list_state);
    rotateLogicalToPhysical();

    epd_poweron();
    epd_clear();
    epd_draw_grayscale_image(epd_full_screen(), physical_fb);
    epd_poweroff_all();
    Serial.println("Liste Frigo: choix liste affiche");
}

void ListeFrigoDisplay::showKeyboard(const ListPageState &list_state, const char *value, bool extra_page)
{
    Serial.println("Liste Frigo: affichage clavier");
    memset(logical_fb, 0xFF, FRAMEBUFFER_BYTES);
    current_list_state = &list_state;
    drawKeyboardPage(list_state, value, extra_page);
    rotateLogicalToPhysical();

    epd_poweron();
    epd_clear();
    epd_draw_grayscale_image(epd_full_screen(), physical_fb);
    epd_poweroff_all();
    Serial.println("Liste Frigo: clavier affiche");
}

void ListeFrigoDisplay::updateKeyboardValue(const char *value)
{
    drawKeyboardValue(value);
    epd_poweron();
    updateLogicalArea({54, 154, 432, 72});
    epd_poweroff_all();
}

void ListeFrigoDisplay::updateListItemToggle(int8_t visible_row, const ListPageState &list_state)
{
    if (visible_row < 0 || visible_row >= VISIBLE_LIST_ROWS) {
        return;
    }

    updateListItemToggles(1U << visible_row, list_state);
}

void ListeFrigoDisplay::updateListItemToggles(uint8_t visible_rows_mask, const ListPageState &list_state)
{
    if (visible_rows_mask == 0) {
        return;
    }

    Serial.println("Liste Frigo: mise a jour partielle coches groupees");
    current_list_state = &list_state;
    drawRemainingCount(list_state);
    int8_t last_changed_row = 0;
    for (int8_t row = 0; row < VISIBLE_LIST_ROWS; ++row) {
        if ((visible_rows_mask & (1U << row)) == 0) {
            continue;
        }
        const int8_t item_index = list_state.scroll_offset + row;
        if (item_index >= list_state.item_count) {
            continue;
        }
        const int32_t toggle_y = LIST_TOP_Y + row * LIST_ROW_HEIGHT;
        drawToggleCell(toggle_y, list_state.items[item_index].checked);
        last_changed_row = row;
    }

    epd_poweron();
    // One waveform cycle updates the counter and every changed checkbox.
    updateLogicalArea({62, 176, 42, LIST_TOP_Y + last_changed_row * LIST_ROW_HEIGHT + 41 - 176});
    epd_poweroff_all();
    Serial.println("Liste Frigo: mise a jour partielle coches terminee");
}

void ListeFrigoDisplay::updateListWindow(const ListPageState &list_state)
{
    Serial.println("Liste Frigo: mise a jour partielle liste");
    drawPage(TAB_LISTES, &list_state);

    epd_poweron();
    updateLogicalArea({54, 40, 438, 580});
    epd_poweroff_all();
    Serial.println("Liste Frigo: mise a jour partielle liste terminee");
}

void ListeFrigoDisplay::drawPage(NavTabId tab, const ListPageState *list_state)
{
    memset(logical_fb, 0xFF, FRAMEBUFFER_BYTES);
    current_list_state = list_state;

    if (tab == TAB_LISTES) {
        drawListesPage(list_state);
        return;
    }
    if (tab == TAB_METEO) {
        drawWeatherPage();
        return;
    }
    if (tab == TAB_CRECHE) {
        drawCrechePage();
        return;
    }

    drawHeader(tab);
    drawSimplePage(tab);
    drawNavBar(tab);
}

void ListeFrigoDisplay::drawHeader(NavTabId tab)
{
    if (tab == TAB_LISTES) {
        fillRect(32, 0, 6, 760, BLACK);
        fillRect(LOGICAL_WIDTH - 38, 0, 6, 760, BLACK);
        fillRect(32, 0, LOGICAL_WIDTH - 64, 6, BLACK);
        fillRect(32, 150, LOGICAL_WIDTH - 64, 4, BLACK);
        drawTextLimited(62, 48, current_list_state ? current_list_state->name : "Courses", 8, BLACK, 300);
        return;
    }

    fillRect(0, 0, LOGICAL_WIDTH, 22, BLACK);
    drawCenteredText(44, navPageTitle(tab), 9, BLACK);
    drawCenteredText(126, "Demo locale", 4, DARK);
}

void ListeFrigoDisplay::drawListesPage(const ListPageState *list_state)
{
    const ListPageState fallback = {
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
        },
        6,
        0,
    };
    const ListPageState *state = list_state ? list_state : &fallback;
    // Read-only e-paper view: the website is the sole editing surface.
    drawText(52, 34, "SUPERVIE", 3, DARK);
    drawTextLimited(52, 74, state->name, 7, BLACK, 380);
    drawRect(452, 78, 38, 38, 3, BLACK);
    fillRect(462, 88, 18, 3, BLACK);
    fillRect(462, 96, 18, 3, BLACK);
    fillRect(462, 104, 18, 3, BLACK);
    fillRect(32, 144, LOGICAL_WIDTH - 64, 4, BLACK);

    int8_t remaining = 0;
    for (int8_t i = 0; i < state->item_count; ++i) {
        if (!state->items[i].checked) {
            ++remaining;
        }
    }
    char summary[40] = {0};
    snprintf(summary, sizeof(summary), "%d articles a acheter", remaining);
    drawText(52, 164, summary, 3, BLACK);

    constexpr int32_t list_top = 204;
    constexpr int32_t list_bottom = 842;
    const int8_t displayed_items = max<int8_t>(1, min<int8_t>(state->item_count, LIST_ITEM_COUNT));
    const int32_t row_height = max<int32_t>(28, min<int32_t>(44, (list_bottom - list_top) / displayed_items));
    for (int8_t item_index = 0; item_index < state->item_count && item_index < LIST_ITEM_COUNT; ++item_index) {
        drawReadOnlyListItem(list_top + item_index * row_height, row_height,
                             state->items[item_index].label, state->items[item_index].checked);
    }

    if (state->item_count == 0) {
        drawCenteredText(360, "Aucun article", 4, DARK);
    }
    drawPrimaryNavBar(TAB_LISTES);
}

void ListeFrigoDisplay::drawWeatherPage()
{
    drawText(52, 34, "METEO CESAR", 3, DARK);
    char current_time[8] = {0};
    if (weather_time_valid) {
        snprintf(current_time, sizeof(current_time), "%02u:%02u", weather_hour, weather_minute);
        drawText(350, 43, "MAINT", 2, DARK);
        drawText(420, 38, current_time, 3, DARK);
    }
    drawText(52, 78, "PANTIN", 4, BLACK);
    fillRect(32, 116, LOGICAL_WIDTH - 64, 4, BLACK);

    const bool has_weather = weather_state.available;
    const int8_t current_temperature = has_weather ? weather_state.current_temperature : 18;
    const int16_t current_code = has_weather ? weather_state.current_weather_code : 3;
    const bool current_is_day = has_weather ? weather_state.current_is_day : true;
    const int8_t today_max = has_weather ? weather_state.today_max : 23;
    const int8_t today_min = has_weather ? weather_state.today_min : 17;
    char temperature[8] = {0};
    char maximum[14] = {0};
    char minimum[14] = {0};
    snprintf(temperature, sizeof(temperature), "%d C", current_temperature);
    snprintf(maximum, sizeof(maximum), "Max %d C", today_max);
    snprintf(minimum, sizeof(minimum), "Min %d C", today_min);
    drawText(52, 150, temperature, 10, BLACK);
    drawWeatherIcon(330, 160, current_code, current_is_day, BLACK, 2);
    drawTextLimited(52, 270, weatherLabel(current_code), 5, BLACK, 430);
    drawText(52, 324, maximum, 4, BLACK);
    drawText(280, 324, minimum, 4, BLACK);

    fillRect(32, 410, LOGICAL_WIDTH - 64, 4, BLACK);
    const int8_t first_hour = weather_time_valid ? (weather_hour + 1) % 24 : 15;
    for (int8_t i = 0; i < 6; ++i) {
        const bool has_hour = has_weather && i < weather_state.hourly_count;
        const int8_t hour = has_hour ? weather_state.hourly[i].hour : (first_hour + i) % 24;
        const int8_t hourly_temperature = has_hour ? weather_state.hourly[i].temperature : weatherTemperature(hour);
        const int16_t hourly_code = has_hour ? weather_state.hourly[i].weather_code : (weatherIsSunny(hour) ? 0 : 3);
        const bool hourly_is_day = has_hour ? weather_state.hourly[i].is_day : weatherIsSunny(hour);
        char hour_label[5] = {0};
        char temperature_label[8] = {0};
        snprintf(hour_label, sizeof(hour_label), "%dh", hour);
        snprintf(temperature_label, sizeof(temperature_label), "%d C", hourly_temperature);
        drawWeatherHour(46 + i * 78, hour_label, temperature_label, hourly_code, hourly_is_day, 432);
    }
    fillRect(32, 570, LOGICAL_WIDTH - 64, 4, BLACK);
    for (int8_t i = 0; i < 6; ++i) {
        const bool has_hour = has_weather && i + 6 < weather_state.hourly_count;
        const int8_t hour = has_hour ? weather_state.hourly[i + 6].hour : (first_hour + 6 + i) % 24;
        const int8_t hourly_temperature = has_hour ? weather_state.hourly[i + 6].temperature : weatherTemperature(hour);
        const int16_t hourly_code = has_hour ? weather_state.hourly[i + 6].weather_code : (weatherIsSunny(hour) ? 0 : 3);
        const bool hourly_is_day = has_hour ? weather_state.hourly[i + 6].is_day : weatherIsSunny(hour);
        char hour_label[5] = {0};
        char temperature_label[8] = {0};
        snprintf(hour_label, sizeof(hour_label), "%dh", hour);
        snprintf(temperature_label, sizeof(temperature_label), "%d C", hourly_temperature);
        drawWeatherHour(46 + i * 78, hour_label, temperature_label, hourly_code, hourly_is_day, 592);
    }
    if (has_weather) {
        char tomorrow_minimum[14] = {0};
        char tomorrow_maximum[14] = {0};
        snprintf(tomorrow_minimum, sizeof(tomorrow_minimum), "Min %d C", weather_state.tomorrow_min);
        snprintf(tomorrow_maximum, sizeof(tomorrow_maximum), "Max %d C", weather_state.tomorrow_max);
        fillRect(32, 730, LOGICAL_WIDTH - 64, 4, BLACK);
        drawText(52, 750, "DEMAIN", 3, DARK);
        drawText(52, 792, tomorrow_minimum, 3, BLACK);
        drawText(272, 792, tomorrow_maximum, 3, BLACK);
        drawWeatherIcon(432, 744, weather_state.tomorrow_weather_code, true, DARK);
    }
    drawPrimaryNavBar(TAB_METEO);
}

void ListeFrigoDisplay::drawCrechePage()
{
    const int8_t departure_temperature_value = weather_state.departure.available ? weather_state.departure.temperature
        : (weather_state.available ? weather_state.current_temperature : 20);
    const int8_t return_temperature = weather_state.return_forecast.available ? weather_state.return_forecast.temperature
        : (weather_state.available ? weather_state.today_max : 24);
    char departure_temperature[8] = {0};
    char afternoon_temperature[8] = {0};
    snprintf(departure_temperature, sizeof(departure_temperature), "%d C", departure_temperature_value);
    snprintf(afternoon_temperature, sizeof(afternoon_temperature), "%d C", return_temperature);

    drawText(52, 34, "CRECHE CESAR", 3, DARK);
    drawText(52, 74, "PANTIN", 4, BLACK);
    fillRect(32, 116, LOGICAL_WIDTH - 64, 4, BLACK);

    drawText(52, 146, "DEPART 8H", 2, DARK);
    drawText(52, 176, departure_temperature, 6, BLACK);
    drawBabyAvatar(44, 236);

    drawText(240, 218, "CESAR", 4, BLACK);
    drawText(240, 260, "Aujourd hui", 2, DARK);
    const char *clothes[] = {"Body leger", "T shirt leger", "Short leger"};
    for (int8_t row = 0; row < 3; ++row) {
        const int32_t y = 306 + row * 58;
        drawRect(240, y, 30, 30, 3, BLACK);
        drawCheckMark(244, y + 3, BLACK);
        drawText(284, y + 6, clothes[row], 2, BLACK);
        fillRect(240, y + 45, 244, 2, BLACK);
    }

    fillRect(32, 600, LOGICAL_WIDTH - 64, 4, BLACK);
    drawText(52, 632, "RETOUR 17H", 2, DARK);
    drawText(52, 664, afternoon_temperature, 6, BLACK);
    const int16_t return_weather_code = weather_state.return_forecast.available ? weather_state.return_forecast.weather_code
        : (weather_state.available ? weather_state.today_weather_code : 1);
    const bool return_is_day = weather_state.return_forecast.available ? weather_state.return_forecast.is_day : true;
    drawWeatherIcon(294, 672, return_weather_code, return_is_day, BLACK, 2);
    drawText(374, 680, weatherLabel(return_weather_code), 2, BLACK);
    drawText(374, 716, "Gilet leger", 2, DARK);
    fillRect(32, 770, LOGICAL_WIDTH - 64, 4, BLACK);
    drawCenteredText(804, "CESAR A LA CRECHE", 2, DARK);
    drawPrimaryNavBar(TAB_CRECHE);
}

int8_t ListeFrigoDisplay::weatherTemperature(int8_t hour) const
{
    static const int8_t temperatures[] = {17, 17, 16, 16, 16, 17, 18, 19, 20, 21, 22, 23,
                                           23, 22, 21, 20, 19, 18, 18, 17, 17, 17, 17, 17};
    return temperatures[hour % 24];
}

bool ListeFrigoDisplay::weatherIsSunny(int8_t hour) const
{
    return hour >= 13 && hour <= 18;
}

void ListeFrigoDisplay::drawWeatherHour(int32_t x, const char *hour, const char *temperature, int16_t weather_code, bool is_day, int32_t top_y)
{
    drawText(x + (70 - textWidth(hour, 2)) / 2, top_y, hour, 2, BLACK);
    drawWeatherIcon(x + 18, top_y + 42, weather_code, is_day, BLACK);
    drawText(x + (70 - textWidth(temperature, 3)) / 2, top_y + 105, temperature, 3, BLACK);
}

void ListeFrigoDisplay::drawWeatherCloud(int32_t x, int32_t y, uint8_t gray, int32_t scale)
{
    fillRect(x + 4 * scale, y + 14 * scale, 38 * scale, 13 * scale, gray);
    fillRect(x + 10 * scale, y + 8 * scale, 12 * scale, 12 * scale, gray);
    fillRect(x + 20 * scale, y + 3 * scale, 14 * scale, 18 * scale, gray);
    fillRect(x + 32 * scale, y + 10 * scale, 10 * scale, 12 * scale, gray);
}

void ListeFrigoDisplay::drawWeatherSun(int32_t x, int32_t y, uint8_t gray, int32_t scale)
{
    fillRect(x + 8 * scale, y + 8 * scale, 18 * scale, 18 * scale, gray);
    fillRect(x + 14 * scale, y, 4 * scale, 6 * scale, gray);
    fillRect(x + 14 * scale, y + 28 * scale, 4 * scale, 6 * scale, gray);
    fillRect(x, y + 15 * scale, 6 * scale, 4 * scale, gray);
    fillRect(x + 28 * scale, y + 15 * scale, 6 * scale, 4 * scale, gray);
    fillRect(x + 3 * scale, y + 3 * scale, 4 * scale, 4 * scale, gray);
    fillRect(x + 27 * scale, y + 3 * scale, 4 * scale, 4 * scale, gray);
    fillRect(x + 3 * scale, y + 27 * scale, 4 * scale, 4 * scale, gray);
    fillRect(x + 27 * scale, y + 27 * scale, 4 * scale, 4 * scale, gray);
}

const char *ListeFrigoDisplay::weatherLabel(int16_t weather_code) const
{
    if (weather_code == 0) return "Ciel clair";
    if (weather_code <= 2) return "Eclaircies";
    if (weather_code == 3) return "Nuageux";
    if (weather_code <= 48) return "Brouillard";
    if (weather_code <= 67 || (weather_code >= 80 && weather_code <= 82)) return "Pluie";
    if (weather_code <= 77) return "Neige";
    if (weather_code >= 95) return "Orages";
    return "Variable";
}

void ListeFrigoDisplay::drawWeatherIcon(int32_t x, int32_t y, int16_t weather_code, bool is_day, uint8_t gray, int32_t scale)
{
    if (weather_code == 0) {
        if (is_day) drawWeatherSun(x, y, gray, scale);
        else drawWeatherMoon(x, y, gray, scale);
    } else if (weather_code <= 2) {
        if (is_day) drawWeatherSun(x, y, gray, scale);
        drawWeatherCloud(x + 16 * scale, y + 16 * scale, gray, scale);
    } else if (weather_code <= 48 || (weather_code >= 71 && weather_code <= 77)) {
        drawWeatherCloud(x, y, gray, scale);
    } else {
        drawWeatherRain(x, y, gray, scale);
    }
}

void ListeFrigoDisplay::drawWeatherRain(int32_t x, int32_t y, uint8_t gray, int32_t scale)
{
    drawWeatherCloud(x, y, gray, scale);
    fillRect(x + 9 * scale, y + 31 * scale, 4 * scale, 9 * scale, gray);
    fillRect(x + 23 * scale, y + 35 * scale, 4 * scale, 9 * scale, gray);
    fillRect(x + 37 * scale, y + 31 * scale, 4 * scale, 9 * scale, gray);
}

void ListeFrigoDisplay::drawWeatherMoon(int32_t x, int32_t y, uint8_t gray, int32_t scale)
{
    fillRect(x + 10 * scale, y + 2 * scale, 17 * scale, 32 * scale, gray);
    fillRect(x + 4 * scale, y + 8 * scale, 29 * scale, 20 * scale, gray);
    fillRect(x + 18 * scale, y + 3 * scale, 16 * scale, 28 * scale, WHITE);
}

void ListeFrigoDisplay::drawBabyAvatar(int32_t x, int32_t y)
{
    drawMonochromeBitmap(x, y, CESAR_AVATAR_WIDTH, CESAR_AVATAR_HEIGHT, CESAR_AVATAR_BITS, BLACK);
}

void ListeFrigoDisplay::drawBabyNavIcon(int32_t x, int32_t y, uint8_t gray)
{
    drawRect(x + 5, y + 2, 24, 24, 3, gray);
    fillRect(x + 11, y + 9, 3, 3, gray);
    fillRect(x + 20, y + 9, 3, 3, gray);
    fillRect(x + 11, y + 19, 12, 3, gray);
    fillRect(x + 2, y + 29, 30, 14, gray);
}

void ListeFrigoDisplay::drawMonochromeBitmap(int32_t x, int32_t y, int32_t width, int32_t height, const uint8_t *bits, uint8_t gray)
{
    const int32_t bytes_per_row = (width + 7) / 8;
    for (int32_t row = 0; row < height; ++row) {
        for (int32_t col = 0; col < width; ++col) {
            const uint8_t value = pgm_read_byte(bits + row * bytes_per_row + col / 8);
            if (value & (1 << (7 - (col % 8)))) {
                drawPixel(x + col, y + row, gray);
            }
        }
    }
}

void ListeFrigoDisplay::drawListPickerPage(const ListPageState &list_state)
{
    drawText(52, 42, "MES LISTES", 3, DARK);
    drawText(52, 82, "Choisir une liste", 5, BLACK);
    fillRect(32, 136, LOGICAL_WIDTH - 64, 4, BLACK);

    if (list_state.list_count == 0) {
        drawCenteredText(260, "Aucune liste", 4, DARK);
        return;
    }

    for (int8_t i = 0; i < list_state.list_count; ++i) {
        drawListPickerRow(166 + i * 84, list_state.lists[i], list_state.lists[i].id == list_state.id);
    }
    drawText(52, 872, "Le contenu se modifie sur le site", 3, DARK);
}

void ListeFrigoDisplay::drawKeyboardPage(const ListPageState &list_state, const char *value, bool extra_page)
{
    fillRect(32, 0, 6, 760, BLACK);
    fillRect(LOGICAL_WIDTH - 38, 0, 6, 760, BLACK);
    fillRect(32, 0, LOGICAL_WIDTH - 64, 6, BLACK);
    drawText(62, 42, "NOUVEL ARTICLE", 4, BLACK);
    drawTextLimited(62, 92, list_state.name, 6, BLACK, 330);
    drawKeyboardValue(value);

    const char *first_row = extra_page ? "UIOP" : "AZERTY";
    const char *second_row = extra_page ? "JKLM" : "QSDFGH";
    const char *third_row = extra_page ? "-/" : "WXCVBN";
    const int32_t row_x[] = {
        extra_page ? 126 : 54,
        extra_page ? 126 : 54,
        extra_page ? 126 : 54,
    };
    for (int8_t i = 0; first_row[i]; ++i) {
        char label[2] = {first_row[i], 0};
        drawKeyboardKey(row_x[0] + i * 72, 250, label, 68);
    }
    for (int8_t i = 0; second_row[i]; ++i) {
        char label[2] = {second_row[i], 0};
        drawKeyboardKey(row_x[1] + i * 72, 340, label, 68);
    }
    for (int8_t i = 0; third_row[i]; ++i) {
        char label[2] = {third_row[i], 0};
        drawKeyboardKey(row_x[2] + i * 72, 430, label, 68);
    }

    drawActionButton(62, 534, 132, 54, "ESPACE", false);
    drawActionButton(204, 534, 132, 54, "EFFACE", false);
    drawActionButton(346, 534, 132, 54, extra_page ? "AZERTY" : "SUIV.", false);
    drawActionButton(62, 612, 202, 54, "RETOUR", false);
    drawActionButton(276, 612, 202, 54, "AJOUTER", true);
    drawText(112, 704, extra_page ? "Lettres et signes" : "AZERTY 1/2", 3, DARK);
}

void ListeFrigoDisplay::drawKeyboardValue(const char *value)
{
    fillRect(54, 154, 432, 72, WHITE);
    drawRect(62, 162, 416, 56, 3, BLACK);
    if (value && *value) {
        drawTextLimited(76, 174, value, 4, BLACK, 380);
    } else {
        drawText(76, 174, "article", 4, LIGHT);
    }
}

void ListeFrigoDisplay::drawKeyboardKey(int32_t x, int32_t y, const char *label, int32_t width)
{
    drawRect(x, y, width, 76, 3, BLACK);
    drawText(x + (width - textWidth(label, 4)) / 2, y + 24, label, 4, BLACK);
}

void ListeFrigoDisplay::drawSimplePage(NavTabId tab)
{
    fillRect(54, 210, LOGICAL_WIDTH - 108, 6, BLACK);
    drawCenteredText(276, navPageTitle(tab), 8, BLACK);
    drawCenteredText(378, "Test local", 5, BLACK);
    drawRect(72, 492, LOGICAL_WIDTH - 144, 112, 6, BLACK);
    drawCenteredText(528, "Pret", 5, BLACK);
    fillRect(72, 668, LOGICAL_WIDTH - 144, 2, LIGHT);
    drawCenteredText(704, "Tactile local", 4, DARK);
}

void ListeFrigoDisplay::drawNavBar(NavTabId selected_tab)
{
    fillRect(32, 850, LOGICAL_WIDTH - 64, 4, BLACK);
    fillRect(32, 854, LOGICAL_WIDTH - 64, 78, WHITE);
    for (int8_t tab = 0; tab < NAV_TAB_COUNT; ++tab) {
        drawNavItem(static_cast<NavTabId>(tab), tab == selected_tab);
    }
    fillRect(32, 932, LOGICAL_WIDTH - 64, 6, BLACK);
}

void ListeFrigoDisplay::drawPrimaryNavBar(NavTabId selected_tab)
{
    constexpr int32_t nav_top = 850;
    constexpr int32_t item_width = (LOGICAL_WIDTH - 64) / 3;
    fillRect(32, nav_top - 4, LOGICAL_WIDTH - 64, 4, BLACK);
    fillRect(32, nav_top, LOGICAL_WIDTH - 64, 78, WHITE);

    const bool listes_selected = selected_tab == TAB_LISTES;
    const bool creche_selected = selected_tab == TAB_CRECHE;
    const bool meteo_selected = selected_tab == TAB_METEO;
    if (listes_selected) {
        fillRect(35, nav_top + 6, item_width - 6, 60, BLACK);
    }
    if (creche_selected) {
        fillRect(32 + item_width + 3, nav_top + 6, item_width - 6, 60, BLACK);
    }
    if (meteo_selected) {
        fillRect(32 + item_width * 2 + 3, nav_top + 6, item_width - 6, 60, BLACK);
    }

    const uint8_t listes_ink = listes_selected ? WHITE : BLACK;
    const uint8_t creche_ink = creche_selected ? WHITE : BLACK;
    const uint8_t meteo_ink = meteo_selected ? WHITE : BLACK;
    drawRect(64, nav_top + 16, 28, 22, 3, listes_ink);
    fillRect(70, nav_top + 23, 16, 3, listes_ink);
    fillRect(70, nav_top + 31, 16, 3, listes_ink);
    drawText(100, nav_top + 22, "Listes", 2, listes_ink);
    drawBabyNavIcon(202, nav_top + 12, creche_ink);
    drawText(240, nav_top + 22, "Creche", 2, creche_ink);
    drawWeatherCloud(368, nav_top + 17, meteo_ink);
    drawText(412, nav_top + 22, "Meteo", 2, meteo_ink);
    fillRect(32, nav_top + 74, LOGICAL_WIDTH - 64, 4, BLACK);
}

void ListeFrigoDisplay::drawNavItem(NavTabId tab, bool selected)
{
    const int32_t item_w = LOGICAL_WIDTH / NAV_TAB_COUNT;
    const int32_t x = static_cast<int8_t>(tab) * item_w;
    const int32_t center_x = x + item_w / 2;
    const int32_t nav_top = 858;
    const uint8_t ink = selected ? WHITE : BLACK;

    if (selected) {
        fillRect(x + 7, nav_top, item_w - 14, 66, BLACK);
    }

    if (tab == TAB_LISTES) {
        drawRect(center_x - 18, nav_top + 16, 36, 28, 4, ink);
        fillRect(center_x - 10, nav_top + 24, 20, 3, ink);
        fillRect(center_x - 10, nav_top + 34, 20, 3, ink);
    } else if (tab == TAB_METEO) {
        drawRect(center_x - 19, nav_top + 28, 38, 20, 4, ink);
        fillRect(center_x - 12, nav_top + 18, 24, 14, ink);
    } else if (tab == TAB_TENUES) {
        drawRect(center_x - 16, nav_top + 18, 32, 34, 4, ink);
        fillRect(center_x - 26, nav_top + 22, 10, 13, ink);
        fillRect(center_x + 16, nav_top + 22, 10, 13, ink);
    } else if (tab == TAB_VELIB) {
        drawRect(center_x - 25, nav_top + 34, 50, 16, 4, ink);
        drawRect(center_x - 22, nav_top + 18, 16, 16, 3, ink);
        drawRect(center_x + 6, nav_top + 18, 16, 16, 3, ink);
    } else {
        drawRect(center_x - 25, nav_top + 22, 50, 28, 4, ink);
        fillRect(center_x - 16, nav_top + 15, 32, 7, ink);
    }

    drawText(x + (item_w - textWidth(navAsciiName(tab), 2)) / 2, nav_top + 50, navAsciiName(tab), 2, ink);
}

void ListeFrigoDisplay::rotateLogicalToPhysical()
{
    memset(physical_fb, 0xFF, FRAMEBUFFER_BYTES);
    for (int32_t y = 0; y < LOGICAL_HEIGHT; ++y) {
        for (int32_t x = 0; x < LOGICAL_WIDTH; ++x) {
            const uint8_t gray = getNibble(logical_fb, LOGICAL_WIDTH, x, y);
            // Portrait presentation with the USB-C connector at the top.
            const int32_t physical_x = EPD_WIDTH - 1 - y;
            const int32_t physical_y = x;
            setNibble(physical_fb, EPD_WIDTH, physical_x, physical_y, gray);
        }
    }
}

void ListeFrigoDisplay::drawListItem(int32_t y, const char *label, bool checked)
{
    drawToggleCell(y, checked);
    drawTextLimited(128, y + 4, label, 5, BLACK, 285);
    fillRect(62, y + 52, 378, 2, BLACK);
}

void ListeFrigoDisplay::drawReadOnlyListItem(int32_t y, int32_t height, const char *label, bool checked)
{
    const int32_t box_size = min<int32_t>(26, height - 8);
    const int32_t box_y = y + (height - box_size) / 2;
    drawRect(52, box_y, box_size, box_size, 3, BLACK);
    if (checked) {
        fillRect(57, box_y + 5, box_size - 10, box_size - 10, BLACK);
    }

    const int32_t text_scale = height >= 40 ? 4 : 3;
    const int32_t text_y = y + (height - text_scale * 8) / 2;
    drawItemPictogram(94, y + (height - 22) / 2, 22, label);
    drawTextLimited(126, text_y, label, text_scale, BLACK, 356);
    fillRect(52, y + height - 2, 436, 2, BLACK);
}

void ListeFrigoDisplay::drawItemPictogram(int32_t x, int32_t y, int32_t size, const char *label)
{
    const int32_t stroke = max<int32_t>(2, size / 9);
    const ItemPictogram pictogram = pictogramForLabel(label);

    if (pictogram == PICTO_MILK) {
        drawRect(x + 5, y + 5, size - 10, size - 5, stroke, BLACK);
        fillRect(x + 8, y, size - 16, 6, BLACK);
        return;
    }
    if (pictogram == PICTO_BREAD) {
        drawRect(x + 2, y + 7, size - 4, size - 9, stroke, BLACK);
        fillRect(x + 6, y + 4, size - 12, 4, BLACK);
        fillRect(x + 7, y + 11, 3, 6, BLACK);
        fillRect(x + 13, y + 11, 3, 6, BLACK);
        return;
    }
    if (pictogram == PICTO_FRUIT || pictogram == PICTO_VEGETABLE) {
        drawRect(x + 4, y + 6, size - 8, size - 7, stroke, BLACK);
        fillRect(x + size / 2 - 2, y, 4, 7, BLACK);
        fillRect(x + size / 2 + 2, y + 2, 6, 3, BLACK);
        if (pictogram == PICTO_VEGETABLE) fillRect(x + 2, y + size / 2, size - 4, 3, BLACK);
        return;
    }
    if (pictogram == PICTO_BABY) {
        drawRect(x + 3, y + 5, size - 6, size - 7, stroke, BLACK);
        fillRect(x + 7, y + 9, 3, 3, BLACK);
        fillRect(x + size - 10, y + 9, 3, 3, BLACK);
        fillRect(x + 7, y + size - 8, size - 14, 3, BLACK);
        return;
    }
    if (pictogram == PICTO_HOME) {
        drawRect(x + 5, y + 7, size - 10, size - 8, stroke, BLACK);
        fillRect(x + 8, y + 2, size - 16, 4, BLACK);
        return;
    }
    if (pictogram == PICTO_PANTRY) {
        drawRect(x + 6, y + 3, size - 12, size - 4, stroke, BLACK);
        fillRect(x + 4, y + 7, size - 8, 3, BLACK);
        fillRect(x + 9, y + 13, size - 18, 3, BLACK);
        return;
    }

    drawRect(x + 3, y + 8, size - 6, size - 10, stroke, BLACK);
    fillRect(x + 6, y + 4, size - 12, 3, BLACK);
    fillRect(x + 9, y + 1, size - 18, 3, BLACK);
}

void ListeFrigoDisplay::drawListPickerRow(int32_t y, const ListSummary &list, bool selected)
{
    if (selected) {
        fillRect(52, y, 436, 70, BLACK);
    } else {
        drawRect(52, y, 436, 70, 3, BLACK);
    }
    const uint8_t ink = selected ? WHITE : BLACK;
    drawTextLimited(70, y + 13, list.name, 4, ink, 300);
    char remaining[24] = {0};
    snprintf(remaining, sizeof(remaining), "%d a acheter", list.remaining_count);
    drawText(70, y + 44, remaining, 2, ink);
    fillRect(450, y + 26, 16, 3, ink);
    fillRect(458, y + 18, 3, 19, ink);
    fillRect(463, y + 23, 3, 9, ink);
}

void ListeFrigoDisplay::drawRemainingCount(const ListPageState &list_state)
{
    int8_t remaining = 0;
    for (int8_t i = 0; i < list_state.item_count; ++i) {
        if (!list_state.items[i].checked) {
            ++remaining;
        }
    }

    fillRect(62, 176, 42, 50, WHITE);

    char count[4] = {0};
    snprintf(count, sizeof(count), "%d", remaining);
    drawText(62, 176, count, 7, BLACK);
}

void ListeFrigoDisplay::drawToggleCell(int32_t y, bool checked)
{
    fillRect(62, y + 7, 34, 34, WHITE);
    drawRect(62, y + 7, 34, 34, 4, BLACK);
    if (checked) {
        fillRect(68, y + 13, 22, 22, BLACK);
        drawCheckMark(71, y + 16, WHITE);
    }
}

void ListeFrigoDisplay::drawScrollButtons(const ListPageState &list_state)
{
    if (list_state.item_count <= VISIBLE_LIST_ROWS) {
        return;
    }

    const int8_t max_offset = max<int8_t>(0, list_state.item_count - VISIBLE_LIST_ROWS);
    if (list_state.scroll_offset > 0) {
        drawArrowButton(376, 52, true, BLACK);
    }
    if (list_state.scroll_offset < max_offset) {
        drawArrowButton(438, 52, false, BLACK);
    }
}

void ListeFrigoDisplay::drawArrowButton(int32_t x, int32_t y, bool up, uint8_t gray)
{
    drawRect(x, y, 44, 56, 4, gray);
    if (up) {
        fillRect(x + 20, y + 14, 4, 28, gray);
        fillRect(x + 14, y + 20, 16, 4, gray);
        fillRect(x + 17, y + 14, 10, 4, gray);
    } else {
        fillRect(x + 20, y + 14, 4, 28, gray);
        fillRect(x + 14, y + 36, 16, 4, gray);
        fillRect(x + 17, y + 42, 10, 4, gray);
    }
}

void ListeFrigoDisplay::drawActionButton(int32_t x, int32_t y, int32_t w, int32_t h, const char *label, bool filled)
{
    if (filled) {
        fillRect(x, y, w, h, BLACK);
    } else {
        drawRect(x, y, w, h, 3, BLACK);
    }
    drawText(x + (w - textWidth(label, 2)) / 2, y + (h - 14) / 2, label, 2, filled ? WHITE : BLACK);
}

void ListeFrigoDisplay::drawCheckMark(int32_t x, int32_t y, uint8_t gray)
{
    for (int32_t i = 0; i < 8; ++i) {
        fillRect(x + i * 2, y + 10 + i, 3, 3, gray);
    }
    for (int32_t i = 0; i < 14; ++i) {
        fillRect(x + 15 + i * 2, y + 18 - i, 3, 3, gray);
    }
}

void ListeFrigoDisplay::updateLogicalArea(Rect_t logical_area)
{
    Rect_t physical_area = {0, 0, 0, 0};
    copyLogicalAreaToPhysicalBuffer(logical_area, physical_area);
    epd_clear_area(physical_area);
    epd_draw_grayscale_image(physical_area, partial_fb);
}

void ListeFrigoDisplay::copyLogicalAreaToPhysicalBuffer(Rect_t logical_area, Rect_t &physical_area)
{
    physical_area.x = EPD_WIDTH - logical_area.y - logical_area.height;
    physical_area.y = logical_area.x;
    physical_area.width = logical_area.height;
    physical_area.height = logical_area.width;

    memset(partial_fb, 0xFF, packedBytes(physical_area.width, physical_area.height));
    for (int32_t py = 0; py < physical_area.height; ++py) {
        for (int32_t px = 0; px < physical_area.width; ++px) {
            const int32_t physical_x = physical_area.x + px;
            const int32_t physical_y = physical_area.y + py;
            const int32_t logical_x = physical_y;
            const int32_t logical_y = EPD_WIDTH - 1 - physical_x;
            const uint8_t gray = getNibble(logical_fb, LOGICAL_WIDTH, logical_x, logical_y);
            setNibble(partial_fb, physical_area.width, px, py, gray);
        }
    }
}

size_t ListeFrigoDisplay::packedBytes(int32_t width, int32_t height)
{
    return static_cast<size_t>((width + 1) / 2) * height;
}

void ListeFrigoDisplay::drawCenteredText(int32_t y, const char *text, int32_t scale, uint8_t gray)
{
    drawText((LOGICAL_WIDTH - textWidth(text, scale)) / 2, y, text, scale, gray);
}

void ListeFrigoDisplay::drawText(int32_t x, int32_t y, const char *text, int32_t scale, uint8_t gray)
{
    int32_t cursor = x;
    while (*text) {
        const uint8_t *glyph = glyphFor(*text);
        for (int32_t row = 0; row < 7; ++row) {
            for (int32_t col = 0; col < 5; ++col) {
                if (glyph[row] & (1 << (4 - col))) {
                    fillRect(cursor + col * scale, y + row * scale, scale, scale, gray);
                }
            }
        }
        cursor += ((*text == ' ') ? 4 : 6) * scale;
        ++text;
    }
}

void ListeFrigoDisplay::drawTextLimited(int32_t x, int32_t y, const char *text, int32_t scale, uint8_t gray, int32_t max_width)
{
    char clipped[16] = {0};
    int32_t used = 0;
    size_t out = 0;
    while (*text && out < sizeof(clipped) - 1) {
        const int32_t char_width = ((*text == ' ') ? 4 : 6) * scale;
        if (used + char_width > max_width) {
            break;
        }
        clipped[out++] = *text++;
        used += char_width;
    }
    drawText(x, y, clipped, scale, gray);
}

void ListeFrigoDisplay::drawRect(int32_t x, int32_t y, int32_t w, int32_t h, int32_t stroke, uint8_t gray)
{
    fillRect(x, y, w, stroke, gray);
    fillRect(x, y + h - stroke, w, stroke, gray);
    fillRect(x, y, stroke, h, gray);
    fillRect(x + w - stroke, y, stroke, h, gray);
}

void ListeFrigoDisplay::fillRect(int32_t x, int32_t y, int32_t w, int32_t h, uint8_t gray)
{
    for (int32_t yy = y; yy < y + h; ++yy) {
        for (int32_t xx = x; xx < x + w; ++xx) {
            drawPixel(xx, yy, gray);
        }
    }
}

void ListeFrigoDisplay::drawPixel(int32_t x, int32_t y, uint8_t gray)
{
    if (x < 0 || x >= LOGICAL_WIDTH || y < 0 || y >= LOGICAL_HEIGHT) {
        return;
    }
    setNibble(logical_fb, LOGICAL_WIDTH, x, y, gray);
}

void ListeFrigoDisplay::setNibble(uint8_t *fb, int32_t width, int32_t x, int32_t y, uint8_t gray)
{
    if (x < 0 || x >= width || y < 0) {
        return;
    }
    const int32_t byte_width = width / 2 + (width % 2);
    uint8_t *byte = &fb[y * byte_width + x / 2];
    const uint8_t value = gray >> 4;
    if (x & 1) {
        *byte = (*byte & 0x0F) | (value << 4);
    } else {
        *byte = (*byte & 0xF0) | value;
    }
}

uint8_t ListeFrigoDisplay::getNibble(const uint8_t *fb, int32_t width, int32_t x, int32_t y)
{
    const int32_t byte_width = width / 2 + (width % 2);
    const uint8_t byte = fb[y * byte_width + x / 2];
    const uint8_t value = (x & 1) ? (byte >> 4) : (byte & 0x0F);
    return value << 4;
}

int32_t ListeFrigoDisplay::textWidth(const char *text, int32_t scale)
{
    int32_t width = 0;
    while (*text) {
        width += ((*text == ' ') ? 4 : 6) * scale;
        ++text;
    }
    return width > 0 ? width - scale : 0;
}
