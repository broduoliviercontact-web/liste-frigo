#include "ListeFrigoDisplay.h"
#include "ListeFrigoCesarAvatar.h"
#include "ListeFrigoWorldMap.h"

namespace {

constexpr uint8_t BLACK = 0x00;
constexpr uint8_t DARK = 0x33;
constexpr uint8_t MID = 0x88;
constexpr uint8_t LIGHT = 0xDD;
constexpr uint8_t WHITE = 0xFF;
constexpr int32_t AIR_RADAR_CX = LOGICAL_WIDTH / 2;
constexpr int32_t AIR_RADAR_CY = 414;
constexpr int32_t AIR_RADAR_RADIUS = 246;
constexpr Rect_t AIR_RADAR_AREA = {8, 126, LOGICAL_WIDTH - 16, 568};

constexpr NavTabId DEFAULT_VISIBLE_TABS[NAV_VISIBLE_TAB_MAX] = {
    TAB_LISTES,
    TAB_CRECHE,
    TAB_METEO,
    TAB_REPAS,
    TAB_METRO,
    TAB_AGENDA,
    TAB_ISS,
    TAB_AIR,
};

const char *AGENDA_DAY_LABELS[AGENDA_DAY_COUNT] = {"LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"};

char agendaCategoryMark(const char *category)
{
    if (!category || !*category) return 'F';
    if (strcmp(category, "travail") == 0) return 'T';
    if (strcmp(category, "sante") == 0) return 'S';
    if (strcmp(category, "maison") == 0) return 'M';
    if (strcmp(category, "creche") == 0) return 'C';
    return 'F';
}

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
    {'+', {0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000}},
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

void ListeFrigoDisplay::setMealTime(uint8_t day_index, uint8_t hour, bool valid)
{
    meal_day_index = day_index % 7;
    meal_hour = hour;
    meal_time_valid = valid;
}

void ListeFrigoDisplay::setWeatherState(const WeatherState &state)
{
    weather_state = state;
}

void ListeFrigoDisplay::setMealWeekState(const MealWeekState &state)
{
    meal_week_state = state;
}

void ListeFrigoDisplay::setMetroState(const MetroState &state)
{
    metro_state = state;
}

void ListeFrigoDisplay::setEpaperSettings(const EpaperSettings &settings)
{
    epaper_settings = settings;
}

void ListeFrigoDisplay::setIssState(const IssState &state)
{
    iss_state = state;
}

void ListeFrigoDisplay::setAirState(const AirState &state)
{
    air_state = state;
    if (selected_aircraft >= air_state.aircraft_count) selected_aircraft = -1;
}

void ListeFrigoDisplay::setAgendaState(const AgendaState &state)
{
    agenda_state = state;
}

void ListeFrigoDisplay::setSelectedAircraft(int8_t index)
{
    selected_aircraft = index >= 0 && index < air_state.aircraft_count ? index : -1;
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
    if (tab == TAB_REPAS) {
        drawMealsPage();
        return;
    }
    if (tab == TAB_METRO) {
        drawMetroPage();
        return;
    }
    if (tab == TAB_AGENDA) {
        drawAgendaPage();
        return;
    }
    if (tab == TAB_REGLAGES) {
        drawSettingsPage();
        return;
    }
    if (tab == TAB_ISS) {
        drawIssPage();
        return;
    }
    if (tab == TAB_AIR) {
        drawAirPage();
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
    drawCrecheWeatherIcon(306, 666, return_weather_code, return_is_day, BLACK);
    drawText(374, 680, weatherLabel(return_weather_code), 2, BLACK);
    drawText(374, 716, "Gilet leger", 2, DARK);
    fillRect(32, 770, LOGICAL_WIDTH - 64, 4, BLACK);
    drawCenteredText(804, "CESAR A LA CRECHE", 2, DARK);
    drawPrimaryNavBar(TAB_CRECHE);
}

void ListeFrigoDisplay::drawMealsPage()
{
    static const char *days[] = {"LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"};
    drawText(52, 34, "REPAS", 3, DARK);
    drawText(52, 74, "TOUTE LA SEMAINE", 4, BLACK);
    fillRect(32, 116, LOGICAL_WIDTH - 64, 4, BLACK);

    constexpr int32_t grid_x = 32;
    constexpr int32_t grid_y = 142;
    constexpr int32_t grid_w = LOGICAL_WIDTH - 64;
    constexpr int32_t cell_w = grid_w / 2;
    constexpr int32_t cell_h = 154;
    constexpr int32_t grid_h = cell_h * 4;

    int8_t first_slot = 0;
    if (meal_time_valid) {
        first_slot = static_cast<int8_t>(meal_day_index) * 2;
        if (meal_hour >= 21) first_slot += 2;
        else if (meal_hour >= 14) first_slot += 1;
    }

    drawRect(grid_x, grid_y, grid_w, grid_h, 3, BLACK);
    fillRect(grid_x + cell_w, grid_y, 3, grid_h, BLACK);
    for (int8_t row = 1; row < 4; ++row) {
        fillRect(grid_x, grid_y + row * cell_h, grid_w, 3, BLACK);
    }

    for (int8_t day = 0; day < 7; ++day) {
        const int32_t x = grid_x + (day % 2) * cell_w + 12;
        const int32_t y = grid_y + (day / 2) * cell_h + 12;
        const int8_t lunch_slot = day * 2;
        const int8_t dinner_slot = lunch_slot + 1;
        const bool hide_lunch = meal_time_valid && lunch_slot < first_slot;
        const bool hide_dinner = meal_time_valid && dinner_slot < first_slot;
        const char *lunch = "-";
        const char *dinner = "-";
        for (int8_t meal = 0; meal < meal_week_state.meal_count; ++meal) {
            const WeekMeal &entry = meal_week_state.meals[meal];
            if (entry.day_index != day) continue;
            if (entry.lunch && !hide_lunch) lunch = entry.label;
            else if (!entry.lunch && !hide_dinner) dinner = entry.label;
        }

        drawText(x, y, days[day], 1, BLACK);
        drawText(x + 1, y, days[day], 1, BLACK);
        drawText(x, y + 30, "MIDI", 1, DARK);
        drawTextLimited(x, y + 46, lunch, 1, BLACK, cell_w - 28);
        drawText(x, y + 84, "SOIR", 1, DARK);
        drawTextLimited(x, y + 100, dinner, 1, BLACK, cell_w - 28);
    }
    fillRect(220, 796, 10, 10, BLACK);
    drawText(244, 796, "REPAS SYNCHRONISES", 1, BLACK);
    drawPrimaryNavBar(TAB_REPAS);
}

void ListeFrigoDisplay::drawMetroPage()
{
    drawText(52, 34, "DEPLACEMENTS", 3, DARK);
    drawText(52, 74, "RAYMOND QUENEAU", 4, BLACK);
    drawRect(440, 36, 42, 42, 3, BLACK);
    drawText(452, 47, "M", 3, BLACK);
    fillRect(32, 116, LOGICAL_WIDTH - 64, 4, BLACK);
    drawText(52, 142, "PROCHAINS PASSAGES", 2, DARK);
    fillRect(52, 168, 436, 2, BLACK);

    int8_t displayed = 0;
    constexpr int8_t visible_rows = 4;
    for (int8_t index = 0; index < metro_state.line_count && displayed < visible_rows; ++index) {
        const MetroLine &line = metro_state.lines[index];
        if (!line.available || line.direction_count == 0) continue;
        const int32_t y = 184 + displayed * 154;
        drawRect(52, y + 34, 68, 54, 3, BLACK);
        if (line.metro) {
            fillRect(55, y + 37, 62, 48, BLACK);
            drawText(76, y + 51, line.label, 3, WHITE);
        } else {
            drawText(58 + (58 - textWidth(line.label, 3)) / 2, y + 51, line.label, 3, BLACK);
        }

        const MetroDirection &first = line.directions[0];
        drawTextLimited(140, y + 2, first.destination, 2, DARK, 332);
        char first_main[16] = {0};
        snprintf(first_main, sizeof(first_main), first.minutes[0] == 0 ? "A QUAI" : "%d MIN", first.minutes[0]);
        drawText(140, y + 28, first_main, 3, BLACK);
        if (first.passage_count > 1) {
            char first_next[14] = {0};
            snprintf(first_next, sizeof(first_next), "%d MIN", first.minutes[1]);
            const int32_t first_next_x = 150 + textWidth(first_main, 3);
            drawText(first_next_x, y + 34, first_next, 2, DARK);
            if (first.passage_count > 2) {
                char first_third[14] = {0};
                snprintf(first_third, sizeof(first_third), "%d MIN", first.minutes[2]);
                drawText(first_next_x + textWidth(first_next, 2) + 12, y + 34, first_third, 2, DARK);
            }
        }
        fillRect(140, y + 58, 348, 1, LIGHT);
        if (line.direction_count > 1) {
            const MetroDirection &second = line.directions[1];
            drawTextLimited(140, y + 70, second.destination, 2, DARK, 332);
            char second_main[16] = {0};
            snprintf(second_main, sizeof(second_main), second.minutes[0] == 0 ? "A QUAI" : "%d MIN", second.minutes[0]);
            drawText(140, y + 96, second_main, 3, BLACK);
            if (second.passage_count > 1) {
                char second_next[14] = {0};
                snprintf(second_next, sizeof(second_next), "%d MIN", second.minutes[1]);
                const int32_t second_next_x = 150 + textWidth(second_main, 3);
                drawText(second_next_x, y + 102, second_next, 2, DARK);
                if (second.passage_count > 2) {
                    char second_third[14] = {0};
                    snprintf(second_third, sizeof(second_third), "%d MIN", second.minutes[2]);
                    drawText(second_next_x + textWidth(second_next, 2) + 12, y + 102, second_third, 2, DARK);
                }
            }
        } else {
            drawText(140, y + 84, "Autre sens indisponible", 2, LIGHT);
        }
        fillRect(52, y + 134, 436, 2, BLACK);
        ++displayed;
    }

    if (displayed == 0) {
        drawCenteredText(360, "Donnees metro en attente", 3, DARK);
    }
    drawPrimaryNavBar(TAB_METRO);
}

void ListeFrigoDisplay::drawAgendaPage()
{
    drawText(52, 34, "SUPERVIE", 3, DARK);
    drawText(52, 76, "AGENDA", 7, BLACK);
    char count_label[8] = {0};
    snprintf(count_label, sizeof(count_label), "%u", agenda_state.available ? agenda_state.event_count : 0);
    fillRect(432, 58, 58, 58, BLACK);
    drawText(432 + (58 - textWidth(count_label, 4)) / 2, 74, count_label, 4, WHITE);
    fillRect(32, 144, LOGICAL_WIDTH - 64, 4, BLACK);

    drawText(56, 176, "PROCHAIN", 2, DARK);
    drawRect(52, 204, 436, 92, 2, BLACK);
    if (agenda_state.available && agenda_state.upcoming_count > 0) {
        const AgendaItem &next = agenda_state.upcoming[0];
        drawText(72, 222, next.time[0] ? next.time : "--:--", 4, BLACK);
        drawTextLimited(206, 230, next.label, 3, BLACK, 260);
    } else {
        drawText(72, 230, "--:--", 4, BLACK);
        drawTextLimited(206, 238, "A planifier", 3, BLACK, 260);
    }

    fillRect(32, 326, LOGICAL_WIDTH - 64, 4, BLACK);
    constexpr int32_t row_x = 52;
    constexpr int32_t row_w = 436;
    constexpr int32_t day_w = 84;
    constexpr int32_t row_h = 56;
    constexpr int32_t row_gap = 8;
    constexpr int32_t row_top = 350;
    for (int8_t index = 0; index < AGENDA_DAY_COUNT; ++index) {
        const int32_t y = row_top + index * (row_h + row_gap);
        const AgendaDay *day = index < agenda_state.day_count ? &agenda_state.days[index] : nullptr;
        const bool today = day && day->today;
        drawRect(row_x, y, row_w, row_h, 2, BLACK);
        if (today) fillRect(row_x, y, day_w, row_h, BLACK);
        const uint8_t day_ink = today ? WHITE : BLACK;
        const uint8_t day_index = day ? day->day_index % AGENDA_DAY_COUNT : index;
        drawText(row_x + 12, y + 8, AGENDA_DAY_LABELS[day_index], 1, day_ink);
        char day_number[4] = {0};
        if (day && day->day_of_month > 0) snprintf(day_number, sizeof(day_number), "%02u", day->day_of_month);
        else strlcpy(day_number, "--", sizeof(day_number));
        drawText(row_x + 25, y + 26, day_number, 3, day_ink);
        fillRect(row_x + day_w, y, 2, row_h, BLACK);

        const AgendaItem *item = day && day->item_count > 0 ? &day->items[0] : nullptr;
        const int32_t content_x = row_x + day_w + 14;
        if (item) {
            drawText(content_x, y + 19, item->time[0] ? item->time : "--:--", 2, BLACK);
            const char mark[] = {agendaCategoryMark(item->category), 0};
            drawIconCircle(content_x + 74, y + 27, 8, BLACK, 1);
            drawText(content_x + 70, y + 22, mark, 1, BLACK);
            drawTextLimited(content_x + 96, y + 19, item->label, 2, BLACK, 220);
            const uint8_t hidden_count = day->overflow + max<int8_t>(0, day->item_count - 1);
            if (hidden_count > 0) {
                char more[8] = {0};
                snprintf(more, sizeof(more), "+%u", hidden_count);
                drawText(row_x + row_w - 30, y + 20, more, 2, DARK);
            }
        } else {
            drawIconCircle(content_x + 8, y + 27, 8, BLACK, 1);
            drawText(content_x + 4, y + 22, "F", 1, BLACK);
            drawTextLimited(content_x + 30, y + 19, "Libre", 2, BLACK, 280);
        }
    }
    drawText(92, 818, agenda_state.available ? "Agenda synchronise - edition sur site" : "Agenda en attente", 2, DARK);
    drawPrimaryNavBar(TAB_AGENDA);
}

void ListeFrigoDisplay::drawSettingsPage()
{
    drawText(52, 34, "EPAPER", 3, DARK);
    drawText(52, 74, "REGLAGES", 5, BLACK);
    fillRect(32, 126, LOGICAL_WIDTH - 64, 4, BLACK);

    drawText(52, 162, "Onglet au demarrage", 2, DARK);
    drawText(52, 198, navSerialName(epaper_settings.preferred_tab == TAB_NONE ? TAB_LISTES : epaper_settings.preferred_tab), 5, BLACK);

    fillRect(52, 276, 436, 2, BLACK);
    drawText(52, 308, "Onglets visibles", 2, DARK);
    const NavTabId *tabs = epaper_settings.visible_tab_count > 0 ? epaper_settings.visible_tabs : DEFAULT_VISIBLE_TABS;
    const int8_t count = epaper_settings.visible_tab_count > 0 ? epaper_settings.visible_tab_count : NAV_VISIBLE_TAB_MAX;
    for (int8_t i = 0; i < count && i < NAV_VISIBLE_TAB_MAX; ++i) {
        const int32_t x = 52 + (i % 2) * 214;
        const int32_t y = 350 + (i / 2) * 70;
        drawRect(x, y, 182, 48, 3, BLACK);
        drawText(x + 16, y + 15, navAsciiName(tabs[i]), 2, BLACK);
    }

    fillRect(52, 562, 436, 2, BLACK);
    drawText(52, 594, "Carrousel", 2, DARK);
    drawText(52, 630, epaper_settings.carousel_enabled ? "ACTIVE" : "ARRETE", 5, BLACK);
    char interval[32] = {0};
    snprintf(interval, sizeof(interval), "toutes %u sec", epaper_settings.carousel_interval_seconds);
    drawText(52, 696, interval, 3, DARK);
    drawText(52, 768, "A modifier sur le site", 2, DARK);
    drawPrimaryNavBar(TAB_REGLAGES);
}

void ListeFrigoDisplay::drawWorldMapMini(int32_t x, int32_t y, int32_t w, int32_t h, uint8_t gray)
{
    fillRect(x, y, w, h, DARK);
    for (int8_t column = 1; column < 4; ++column) {
        drawIconLine(x + column * w / 4, y, x + column * w / 4, y + h - 1, MID, 1);
    }
    for (int8_t row = 1; row < 4; ++row) {
        drawIconLine(x, y + row * h / 4, x + w - 1, y + row * h / 4, MID, 1);
    }
    for (const WorldCoastline &coastline : WORLD_COASTLINES) {
        for (uint16_t index = 1; index < coastline.count; ++index) {
            const uint8_t *from = coastline.points[index - 1];
            const uint8_t *to = coastline.points[index];
            drawIconLine(x + from[0] * (w - 1) / 255, y + from[1] * (h - 1) / 255,
                         x + to[0] * (w - 1) / 255, y + to[1] * (h - 1) / 255, LIGHT, 1);
        }
    }
    drawRect(x, y, w, h, 3, gray);
}

void ListeFrigoDisplay::drawIssPage()
{
    drawText(52, 34, "ISS TRACKER", 4, BLACK);
    fillRect(32, 92, LOGICAL_WIDTH - 64, 4, BLACK);
    char speed_label[32] = {0};
    if (iss_state.available && iss_state.speed_kmh > 0) snprintf(speed_label, sizeof(speed_label), "%u km/h", iss_state.speed_kmh);
    else strlcpy(speed_label, "-- km/h", sizeof(speed_label));
    drawText(52, 118, "Vitesse", 2, DARK);
    drawText(170, 112, speed_label, 4, BLACK);
    drawText(52, 166, "Au-dessus de", 2, DARK);
    drawTextLimited(52, 200, iss_state.available ? iss_state.over : "Donnees ISS en attente", 3, BLACK, 432);
    char distance_label[40] = {0};
    if (iss_state.available && iss_state.distance_km > 0) {
        if (iss_state.distance_km >= 1000) {
            snprintf(distance_label, sizeof(distance_label), "Distance: %u %03u km de nous",
                     iss_state.distance_km / 1000, iss_state.distance_km % 1000);
        } else {
            snprintf(distance_label, sizeof(distance_label), "Distance: %u km de nous", iss_state.distance_km);
        }
    } else {
        strlcpy(distance_label, "Distance en attente", sizeof(distance_label));
    }
    drawText(52, 242, distance_label, 2, DARK);

    constexpr int32_t map_x = 52;
    constexpr int32_t map_y = 268;
    constexpr int32_t map_w = 436;
    constexpr int32_t map_h = 300;
    drawWorldMapMini(map_x, map_y, map_w, map_h, DARK);
    for (int8_t i = 1; i < iss_state.track_count; ++i) {
        if (abs(iss_state.track[i].x - iss_state.track[i - 1].x) > 127) continue;
        drawIconLine(map_x + iss_state.track[i - 1].x * map_w / 255, map_y + iss_state.track[i - 1].y * map_h / 255,
                     map_x + iss_state.track[i].x * map_w / 255, map_y + iss_state.track[i].y * map_h / 255, WHITE, 2);
    }
    const int32_t home_x = map_x + 129 * map_w / 255;
    const int32_t home_y = map_y + 58 * map_h / 255;
    drawIconCircle(home_x, home_y, 5, WHITE, 1);
    drawIconLine(home_x - 8, home_y, home_x + 8, home_y, WHITE, 1);
    drawIconLine(home_x, home_y - 8, home_x, home_y + 8, WHITE, 1);
    drawText(home_x + 10, home_y - 10, "NOUS", 1, WHITE);
    if (iss_state.available) {
        const int32_t iss_x = map_x + iss_state.map_x * map_w / 255;
        const int32_t iss_y = map_y + iss_state.map_y * map_h / 255;
        drawIconFilledCircle(iss_x, iss_y, 10, WHITE, 1);
        drawIconFilledCircle(iss_x, iss_y, 6, BLACK, 1);
    }
    drawIconLine(52, 617, 82, 617, BLACK, 2);
    drawText(94, 608, "trajectoire prevue", 3, DARK);
    drawIconFilledCircle(66, 660, 7, BLACK, 1);
    drawText(94, 650, "ISS maintenant", 3, BLACK);
    drawText(52, 764, iss_state.available ? "Donnees synchronisees" : "Donnees ISS en attente", 2, DARK);
    drawPrimaryNavBar(TAB_ISS);
}

void ListeFrigoDisplay::drawAirPage()
{
    drawText(52, 34, "AIR", 5, BLACK);
    drawText(180, 46, "RADAR LOCAL", 3, DARK);
    fillRect(32, 104, LOGICAL_WIDTH - 64, 4, BLACK);

    // Keep the radar static: repeated sweep updates cause visible e-paper ghosting.
    drawAirRadar();

    if (selected_aircraft >= 0 && selected_aircraft < air_state.aircraft_count) {
        drawAirDetails(air_state.aircraft[selected_aircraft]);
    } else {
        char radius_label[24] = {0};
        snprintf(radius_label, sizeof(radius_label), "%u km", air_state.available && air_state.radius_km > 0 ? air_state.radius_km : 25);
        drawText(52, 720, "Portee", 2, DARK);
        drawText(152, 714, radius_label, 3, BLACK);
        drawText(52, 764, air_state.available ? "Trafic synchronise" : "Trafic aerien en attente", 2, DARK);
    }
    drawPrimaryNavBar(TAB_AIR);
}

void ListeFrigoDisplay::drawAirRadar()
{
    fillRect(AIR_RADAR_AREA.x, AIR_RADAR_AREA.y, AIR_RADAR_AREA.width, AIR_RADAR_AREA.height, WHITE);

    const int32_t radii[] = {66, 126, 186, 246};
    for (uint8_t i = 0; i < 4; ++i) {
        drawIconCircle(AIR_RADAR_CX, AIR_RADAR_CY, radii[i], BLACK, 1);
    }
    drawIconLine(AIR_RADAR_CX, AIR_RADAR_CY - 260, AIR_RADAR_CX, AIR_RADAR_CY + 260, BLACK, 1);
    drawIconLine(AIR_RADAR_CX - 260, AIR_RADAR_CY, AIR_RADAR_CX + 260, AIR_RADAR_CY, BLACK, 1);
    drawIconLine(AIR_RADAR_CX - 184, AIR_RADAR_CY - 184, AIR_RADAR_CX + 184, AIR_RADAR_CY + 184, DARK, 1);
    drawIconLine(AIR_RADAR_CX - 184, AIR_RADAR_CY + 184, AIR_RADAR_CX + 184, AIR_RADAR_CY - 184, DARK, 1);
    drawText(AIR_RADAR_CX - 8, AIR_RADAR_CY - 280, "N", 2, BLACK);
    drawText(AIR_RADAR_CX + 262, AIR_RADAR_CY - 8, "E", 2, BLACK);
    drawText(AIR_RADAR_CX - 8, AIR_RADAR_CY + 262, "S", 2, BLACK);
    drawText(AIR_RADAR_CX - 280, AIR_RADAR_CY - 8, "W", 2, BLACK);

    const int8_t count = air_state.available ? air_state.aircraft_count : 0;
    for (int8_t i = 0; i < count && i < AIRCRAFT_COUNT; ++i) {
        const Aircraft &plane = air_state.aircraft[i];
        const int32_t x = 52 + plane.x * 436 / 255;
        const int32_t y = 154 + plane.y * 520 / 255;
        if (i == selected_aircraft) drawIconCircle(x, y, 18, DARK, 2);
        drawRadarPlane(x, y, plane.heading, BLACK);
        const int32_t label_width = min<int32_t>(100, textWidth(plane.registration, 2));
        const int32_t label_x = x + 16 + label_width <= LOGICAL_WIDTH - 18 ? x + 16 : x - label_width - 16;
        fillRect(label_x - 3, y - 12, label_width + 6, 20, WHITE);
        drawTextLimited(label_x, y - 10, plane.registration, 2, BLACK, 100);
    }
}

void ListeFrigoDisplay::drawAirDetails(const Aircraft &plane)
{
    constexpr int32_t panel_x = 32;
    constexpr int32_t panel_y = 704;
    constexpr int32_t panel_w = LOGICAL_WIDTH - 64;
    drawRect(panel_x, panel_y, panel_w, 126, 2, BLACK);

    drawText(panel_x + 12, panel_y + 10, plane.registration, 3, BLACK);
    const int32_t tail_x = panel_x + 12 + textWidth(plane.registration, 3) + 12;
    drawTextLimited(tail_x, panel_y + 14, plane.tail_number[0] ? plane.tail_number : "-", 2, DARK, 100);

    char location[24] = {0};
    snprintf(location, sizeof(location), "%s%s%u km", plane.bearing,
             plane.bearing[0] ? " / " : "", plane.distance_km);
    drawText(panel_x + panel_w - 12 - textWidth(location, 2), panel_y + 14, location, 2, BLACK);

    char description[48] = {0};
    snprintf(description, sizeof(description), "%s / %s",
             plane.airline[0] ? plane.airline : "Compagnie inconnue",
             plane.aircraft_type[0] ? plane.aircraft_type : "Type inconnu");
    drawTextLimited(panel_x + 12, panel_y + 39, description, 2, DARK, panel_w - 24);
    drawTextLimited(panel_x + 12, panel_y + 57,
                    plane.route[0] ? plane.route : "Depart > Arrivee inconnus",
                    2, BLACK, panel_w - 24);
    fillRect(panel_x + 10, panel_y + 76, panel_w - 20, 2, BLACK);

    char altitude[24] = {0};
    char speed[24] = {0};
    if (plane.altitude_m >= 1000) {
        snprintf(altitude, sizeof(altitude), "%u %03u m", plane.altitude_m / 1000, plane.altitude_m % 1000);
    } else {
        snprintf(altitude, sizeof(altitude), "%u m", plane.altitude_m);
    }
    snprintf(speed, sizeof(speed), "%u km/h", plane.speed_kmh);
    drawText(panel_x + 12, panel_y + 84, "ALTITUDE", 1, DARK);
    drawText(panel_x + 12, panel_y + 102, altitude, 2, BLACK);
    drawText(panel_x + 266, panel_y + 84, "VITESSE", 1, DARK);
    drawText(panel_x + panel_w - 12 - textWidth(speed, 2), panel_y + 102, speed, 2, BLACK);
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
    const int32_t p[][2] = {
        {6, 27}, {7, 24}, {10, 21}, {14, 20}, {17, 14}, {23, 11},
        {31, 12}, {36, 18}, {40, 18}, {45, 22}, {47, 28}, {44, 34},
        {9, 34}, {6, 30}, {6, 27},
    };
    for (uint8_t i = 1; i < sizeof(p) / sizeof(p[0]); ++i) {
        drawIconLine(x + p[i - 1][0] * scale, y + p[i - 1][1] * scale,
                     x + p[i][0] * scale, y + p[i][1] * scale, gray, scale);
    }
    drawIconLine(x + 12 * scale, y + 35 * scale, x + 41 * scale, y + 35 * scale, gray, scale);
}

void ListeFrigoDisplay::drawWeatherSun(int32_t x, int32_t y, uint8_t gray, int32_t scale)
{
    drawIconCircle(x + 22 * scale, y + 22 * scale, 9 * scale, gray, scale);
    drawIconLine(x + 22 * scale, y + 2 * scale, x + 22 * scale, y + 9 * scale, gray, scale);
    drawIconLine(x + 22 * scale, y + 35 * scale, x + 22 * scale, y + 42 * scale, gray, scale);
    drawIconLine(x + 2 * scale, y + 22 * scale, x + 9 * scale, y + 22 * scale, gray, scale);
    drawIconLine(x + 35 * scale, y + 22 * scale, x + 42 * scale, y + 22 * scale, gray, scale);
    drawIconLine(x + 8 * scale, y + 8 * scale, x + 13 * scale, y + 13 * scale, gray, scale);
    drawIconLine(x + 31 * scale, y + 31 * scale, x + 36 * scale, y + 36 * scale, gray, scale);
    drawIconLine(x + 8 * scale, y + 36 * scale, x + 13 * scale, y + 31 * scale, gray, scale);
    drawIconLine(x + 31 * scale, y + 13 * scale, x + 36 * scale, y + 8 * scale, gray, scale);
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
        else drawWeatherMoon(x, y, gray, scale);
        drawWeatherCloud(x + 10 * scale, y + 8 * scale, gray, scale);
    } else if (weather_code <= 48) {
        drawWeatherFog(x, y, gray, scale);
    } else if ((weather_code >= 71 && weather_code <= 77) || weather_code == 85 || weather_code == 86) {
        drawWeatherSnow(x, y, gray, scale);
    } else if (weather_code >= 95) {
        drawWeatherThunder(x, y, gray, scale);
    } else if (weather_code == 3) {
        drawWeatherCloud(x, y, gray, scale);
    } else {
        drawWeatherRain(x, y, gray, scale);
    }
}

void ListeFrigoDisplay::drawCrecheWeatherIcon(int32_t x, int32_t y, int16_t weather_code, bool is_day, uint8_t gray)
{
    if (weather_code == 0) {
        if (is_day) {
            drawIconCircle(x + 18, y + 16, 7, gray, 1);
            drawIconLine(x + 18, y + 2, x + 18, y + 7, gray, 1);
            drawIconLine(x + 18, y + 25, x + 18, y + 30, gray, 1);
            drawIconLine(x + 4, y + 16, x + 9, y + 16, gray, 1);
            drawIconLine(x + 27, y + 16, x + 32, y + 16, gray, 1);
            drawIconLine(x + 8, y + 6, x + 12, y + 10, gray, 1);
            drawIconLine(x + 24, y + 22, x + 28, y + 26, gray, 1);
            drawIconLine(x + 8, y + 26, x + 12, y + 22, gray, 1);
            drawIconLine(x + 24, y + 10, x + 28, y + 6, gray, 1);
        } else {
            drawIconFilledCircle(x + 18, y + 16, 11, gray, 1);
            drawIconFilledCircle(x + 23, y + 12, 11, WHITE, 1);
            drawIconCircle(x + 18, y + 16, 11, gray, 1);
        }
        return;
    }

    if (weather_code <= 2) {
        if (is_day) {
            drawIconCircle(x + 13, y + 12, 5, gray, 1);
            drawIconLine(x + 13, y + 2, x + 13, y + 6, gray, 1);
            drawIconLine(x + 4, y + 12, x + 8, y + 12, gray, 1);
            drawIconLine(x + 18, y + 7, x + 21, y + 4, gray, 1);
        }
        drawIconLine(x + 9, y + 26, x + 12, y + 21, gray, 1);
        drawIconLine(x + 12, y + 21, x + 17, y + 20, gray, 1);
        drawIconLine(x + 17, y + 20, x + 20, y + 14, gray, 1);
        drawIconLine(x + 20, y + 14, x + 28, y + 15, gray, 1);
        drawIconLine(x + 28, y + 15, x + 32, y + 20, gray, 1);
        drawIconLine(x + 32, y + 20, x + 36, y + 20, gray, 1);
        drawIconLine(x + 36, y + 20, x + 40, y + 25, gray, 1);
        drawIconLine(x + 40, y + 25, x + 37, y + 30, gray, 1);
        drawIconLine(x + 12, y + 30, x + 35, y + 30, gray, 1);
        return;
    }

    const int32_t cloud[][2] = {
        {5, 22}, {7, 18}, {12, 17}, {16, 11}, {24, 11},
        {29, 16}, {33, 16}, {38, 20}, {39, 25}, {36, 29},
        {9, 29}, {5, 25}, {5, 22},
    };
    for (uint8_t i = 1; i < sizeof(cloud) / sizeof(cloud[0]); ++i) {
        drawIconLine(x + cloud[i - 1][0], y + cloud[i - 1][1],
                     x + cloud[i][0], y + cloud[i][1], gray, 1);
    }
    drawIconLine(x + 11, y + 30, x + 34, y + 30, gray, 1);

    if (weather_code <= 48) {
        drawIconLine(x + 7, y + 35, x + 38, y + 35, gray, 1);
        drawIconLine(x + 12, y + 40, x + 33, y + 40, gray, 1);
    } else if ((weather_code >= 71 && weather_code <= 77) || weather_code == 85 || weather_code == 86) {
        drawIconLine(x + 12, y + 37, x + 18, y + 37, gray, 1);
        drawIconLine(x + 15, y + 34, x + 15, y + 40, gray, 1);
        drawIconLine(x + 28, y + 39, x + 34, y + 39, gray, 1);
        drawIconLine(x + 31, y + 36, x + 31, y + 42, gray, 1);
    } else {
        drawIconLine(x + 12, y + 35, x + 9, y + 42, gray, 1);
        drawIconLine(x + 24, y + 36, x + 21, y + 43, gray, 1);
        drawIconLine(x + 36, y + 35, x + 33, y + 42, gray, 1);
        if (weather_code >= 95) {
            drawIconLine(x + 26, y + 32, x + 21, y + 42, gray, 1);
            drawIconLine(x + 21, y + 42, x + 28, y + 42, gray, 1);
            drawIconLine(x + 28, y + 42, x + 23, y + 49, gray, 1);
            drawIconLine(x + 23, y + 49, x + 36, y + 38, gray, 1);
        }
    }
}

void ListeFrigoDisplay::drawWeatherRain(int32_t x, int32_t y, uint8_t gray, int32_t scale)
{
    drawWeatherCloud(x, y, gray, scale);
    drawIconLine(x + 14 * scale, y + 38 * scale, x + 10 * scale, y + 46 * scale, gray, scale);
    drawIconLine(x + 26 * scale, y + 40 * scale, x + 22 * scale, y + 48 * scale, gray, scale);
    drawIconLine(x + 38 * scale, y + 38 * scale, x + 34 * scale, y + 46 * scale, gray, scale);
}

void ListeFrigoDisplay::drawWeatherMoon(int32_t x, int32_t y, uint8_t gray, int32_t scale)
{
    drawIconFilledCircle(x + 23 * scale, y + 22 * scale, 17 * scale, gray, scale);
    drawIconFilledCircle(x + 31 * scale, y + 17 * scale, 17 * scale, WHITE, scale);
    drawIconCircle(x + 23 * scale, y + 22 * scale, 17 * scale, gray, scale);
}

void ListeFrigoDisplay::drawWeatherFog(int32_t x, int32_t y, uint8_t gray, int32_t scale)
{
    drawWeatherCloud(x, y, gray, scale);
    drawIconLine(x + 7 * scale, y + 40 * scale, x + 45 * scale, y + 40 * scale, gray, scale);
    drawIconLine(x + 12 * scale, y + 46 * scale, x + 40 * scale, y + 46 * scale, gray, scale);
}

void ListeFrigoDisplay::drawWeatherSnow(int32_t x, int32_t y, uint8_t gray, int32_t scale)
{
    drawWeatherCloud(x, y, gray, scale);
    const int32_t flakes[][2] = {{14, 42}, {27, 47}, {40, 42}};
    for (uint8_t i = 0; i < sizeof(flakes) / sizeof(flakes[0]); ++i) {
        const int32_t fx = x + flakes[i][0] * scale;
        const int32_t fy = y + flakes[i][1] * scale;
        drawIconLine(fx - 3 * scale, fy, fx + 3 * scale, fy, gray, scale);
        drawIconLine(fx, fy - 3 * scale, fx, fy + 3 * scale, gray, scale);
        drawIconLine(fx - 2 * scale, fy - 2 * scale, fx + 2 * scale, fy + 2 * scale, gray, scale);
        drawIconLine(fx - 2 * scale, fy + 2 * scale, fx + 2 * scale, fy - 2 * scale, gray, scale);
    }
}

void ListeFrigoDisplay::drawWeatherThunder(int32_t x, int32_t y, uint8_t gray, int32_t scale)
{
    drawWeatherRain(x, y, gray, scale);
    drawIconLine(x + 28 * scale, y + 36 * scale, x + 22 * scale, y + 46 * scale, gray, scale);
    drawIconLine(x + 22 * scale, y + 46 * scale, x + 30 * scale, y + 46 * scale, gray, scale);
    drawIconLine(x + 30 * scale, y + 46 * scale, x + 25 * scale, y + 52 * scale, gray, scale);
    drawIconLine(x + 25 * scale, y + 52 * scale, x + 38 * scale, y + 42 * scale, gray, scale);
}

void ListeFrigoDisplay::drawIconPoint(int32_t x, int32_t y, uint8_t gray, int32_t scale)
{
    const int32_t size = max<int32_t>(1, scale);
    fillRect(x - size / 2, y - size / 2, size, size, gray);
}

void ListeFrigoDisplay::drawIconLine(int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint8_t gray, int32_t scale)
{
    const int32_t dx = abs(x1 - x0);
    const int32_t sx = x0 < x1 ? 1 : -1;
    const int32_t dy = -abs(y1 - y0);
    const int32_t sy = y0 < y1 ? 1 : -1;
    int32_t err = dx + dy;
    while (true) {
        drawIconPoint(x0, y0, gray, scale);
        if (x0 == x1 && y0 == y1) break;
        const int32_t e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x0 += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y0 += sy;
        }
    }
}

void ListeFrigoDisplay::drawIconCircle(int32_t cx, int32_t cy, int32_t radius, uint8_t gray, int32_t scale)
{
    int32_t x = radius;
    int32_t y = 0;
    int32_t err = 0;
    while (x >= y) {
        drawIconPoint(cx + x, cy + y, gray, scale);
        drawIconPoint(cx + y, cy + x, gray, scale);
        drawIconPoint(cx - y, cy + x, gray, scale);
        drawIconPoint(cx - x, cy + y, gray, scale);
        drawIconPoint(cx - x, cy - y, gray, scale);
        drawIconPoint(cx - y, cy - x, gray, scale);
        drawIconPoint(cx + y, cy - x, gray, scale);
        drawIconPoint(cx + x, cy - y, gray, scale);
        ++y;
        if (err <= 0) {
            err += 2 * y + 1;
        }
        if (err > 0) {
            --x;
            err -= 2 * x + 1;
        }
    }
}

void ListeFrigoDisplay::drawIconFilledCircle(int32_t cx, int32_t cy, int32_t radius, uint8_t gray, int32_t scale)
{
    for (int32_t row = -radius; row <= radius; ++row) {
        for (int32_t col = -radius; col <= radius; ++col) {
            if (col * col + row * row <= radius * radius) {
                drawIconPoint(cx + col, cy + row, gray, scale);
            }
        }
    }
}

void ListeFrigoDisplay::drawBabyAvatar(int32_t x, int32_t y)
{
    drawMonochromeBitmap(x, y, CESAR_AVATAR_WIDTH, CESAR_AVATAR_HEIGHT, CESAR_AVATAR_BITS, BLACK);
}

void ListeFrigoDisplay::drawBabyNavIcon(int32_t x, int32_t y, uint8_t gray)
{
    drawIconCircle(x + 15, y + 11, 10, gray, 1);
    fillRect(x + 10, y + 8, 3, 3, gray);
    fillRect(x + 18, y + 8, 3, 3, gray);
    drawIconLine(x + 10, y + 16, x + 15, y + 19, gray, 1);
    drawIconLine(x + 15, y + 19, x + 20, y + 16, gray, 1);
    drawRect(x + 5, y + 24, 20, 5, 2, gray);
}

void ListeFrigoDisplay::drawListNavIcon(int32_t x, int32_t y, uint8_t gray)
{
    drawRect(x + 2, y + 3, 28, 22, 3, gray);
    fillRect(x + 8, y + 9, 16, 2, gray);
    fillRect(x + 8, y + 15, 16, 2, gray);
    fillRect(x + 8, y + 21, 11, 2, gray);
}

void ListeFrigoDisplay::drawMealNavIcon(int32_t x, int32_t y, uint8_t gray)
{
    drawIconLine(x + 2, y + 25, x + 28, y + 25, gray, 1);
    drawIconLine(x + 5, y + 22, x + 8, y + 14, gray, 1);
    drawIconLine(x + 8, y + 14, x + 15, y + 10, gray, 1);
    drawIconLine(x + 15, y + 10, x + 22, y + 14, gray, 1);
    drawIconLine(x + 22, y + 14, x + 25, y + 22, gray, 1);
    drawIconLine(x + 5, y + 22, x + 25, y + 22, gray, 1);
    fillRect(x + 13, y + 6, 4, 3, gray);
}

void ListeFrigoDisplay::drawMetroNavIcon(int32_t x, int32_t y, uint8_t gray)
{
    drawRect(x + 2, y + 2, 28, 28, 3, gray);
    drawText(x + 9, y + 8, "M", 2, gray);
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
    const int8_t tab_count = epaper_settings.visible_tab_count > 0 ? min<int8_t>(epaper_settings.visible_tab_count, NAV_VISIBLE_TAB_MAX) : NAV_VISIBLE_TAB_MAX;
    const int32_t available_width = NAV_WIDTH - (tab_count - 1) * NAV_GAP;
    const int32_t item_width = available_width / tab_count;
    const int32_t remainder = available_width % tab_count;
    constexpr int32_t icon_top = NAV_TOP + 8;
    constexpr int32_t label_top = NAV_TOP + 54;

    const NavTabId *tabs = epaper_settings.visible_tab_count > 0 ? epaper_settings.visible_tabs : DEFAULT_VISIBLE_TABS;
    int32_t x = NAV_LEFT;
    for (int8_t index = 0; index < tab_count; ++index) {
        const int32_t width = item_width + (index < remainder ? 1 : 0);
        const bool selected = tabs[index] == selected_tab;
        const uint8_t ink = selected ? WHITE : BLACK;
        if (selected) {
            fillRect(x, NAV_TOP, width, NAV_HEIGHT, BLACK);
        } else {
            drawRect(x, NAV_TOP, width, NAV_HEIGHT, 2, BLACK);
        }
        const int32_t center = x + width / 2;
        if (tabs[index] == TAB_LISTES) {
            drawListNavIcon(center - 16, icon_top, ink);
        } else if (tabs[index] == TAB_CRECHE) {
            drawBabyNavIcon(center - 15, icon_top, ink);
        } else if (tabs[index] == TAB_METEO) {
            drawWeatherCloud(center - 24, NAV_TOP + 1, ink);
        } else if (tabs[index] == TAB_REPAS) {
            drawMealNavIcon(center - 15, icon_top, ink);
        } else if (tabs[index] == TAB_METRO) {
            drawMetroNavIcon(center - 16, icon_top, ink);
        } else if (tabs[index] == TAB_REGLAGES) {
            drawSettingsNavIcon(center - 15, icon_top, ink);
        } else if (tabs[index] == TAB_ISS) {
            drawIssNavIcon(center - 15, icon_top, ink);
        } else if (tabs[index] == TAB_AIR) {
            drawAirNavIcon(center - 15, icon_top, ink);
        } else {
            drawAgendaNavIcon(center - 15, icon_top, ink);
        }
        drawText(x + (width - textWidth(navAsciiName(tabs[index]), 1)) / 2, label_top, navAsciiName(tabs[index]), 1, ink);
        x += width + NAV_GAP;
    }
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
    } else if (tab == TAB_CRECHE) {
        drawRect(center_x - 16, nav_top + 18, 32, 34, 4, ink);
        fillRect(center_x - 26, nav_top + 22, 10, 13, ink);
        fillRect(center_x + 16, nav_top + 22, 10, 13, ink);
    } else if (tab == TAB_REPAS) {
        drawRect(center_x - 25, nav_top + 34, 50, 16, 4, ink);
        drawRect(center_x - 22, nav_top + 18, 16, 16, 3, ink);
        drawRect(center_x + 6, nav_top + 18, 16, 16, 3, ink);
    } else if (tab == TAB_AGENDA) {
        drawRect(center_x - 18, nav_top + 14, 36, 32, 3, ink);
        fillRect(center_x - 18, nav_top + 22, 36, 3, ink);
        fillRect(center_x - 8, nav_top + 10, 3, 8, ink);
        fillRect(center_x + 8, nav_top + 10, 3, 8, ink);
    } else {
        drawRect(center_x - 25, nav_top + 22, 50, 28, 4, ink);
        fillRect(center_x - 16, nav_top + 15, 32, 7, ink);
    }

    drawText(x + (item_w - textWidth(navAsciiName(tab), 2)) / 2, nav_top + 50, navAsciiName(tab), 2, ink);
}

void ListeFrigoDisplay::drawSettingsNavIcon(int32_t x, int32_t y, uint8_t gray)
{
    drawIconCircle(x + 15, y + 15, 12, gray, 1);
    fillRect(x + 13, y + 1, 4, 8, gray);
    fillRect(x + 13, y + 21, 4, 8, gray);
    fillRect(x + 1, y + 13, 8, 4, gray);
    fillRect(x + 21, y + 13, 8, 4, gray);
    drawIconFilledCircle(x + 15, y + 15, 4, gray, 1);
}

void ListeFrigoDisplay::drawIssNavIcon(int32_t x, int32_t y, uint8_t gray)
{
    drawIconCircle(x + 15, y + 15, 12, gray, 1);
    drawIconLine(x + 4, y + 18, x + 26, y + 12, gray, 1);
    fillRect(x + 13, y + 13, 5, 5, gray);
    drawIconLine(x + 15, y + 4, x + 15, y + 26, gray, 1);
    drawIconLine(x + 5, y + 15, x + 25, y + 15, gray, 1);
}

void ListeFrigoDisplay::drawAirNavIcon(int32_t x, int32_t y, uint8_t gray)
{
    drawIconCircle(x + 15, y + 15, 13, gray, 1);
    drawIconCircle(x + 15, y + 15, 7, gray, 1);
    drawRadarPlane(x + 15, y + 15, 45, gray);
}

void ListeFrigoDisplay::drawAgendaNavIcon(int32_t x, int32_t y, uint8_t gray)
{
    drawRect(x + 3, y + 5, 24, 22, 2, gray);
    fillRect(x + 3, y + 11, 24, 2, gray);
    fillRect(x + 8, y + 2, 3, 7, gray);
    fillRect(x + 19, y + 2, 3, 7, gray);
    fillRect(x + 8, y + 17, 4, 4, gray);
    fillRect(x + 15, y + 17, 4, 4, gray);
}

void ListeFrigoDisplay::drawRadarPlane(int32_t x, int32_t y, int16_t heading, uint8_t gray)
{
    int8_t dx = 0;
    int8_t dy = -9;
    if (heading >= 45 && heading < 135) {
        dx = 9;
        dy = 0;
    } else if (heading >= 135 && heading < 225) {
        dx = 0;
        dy = 9;
    } else if (heading >= 225 && heading < 315) {
        dx = -9;
        dy = 0;
    }
    drawIconLine(x, y, x + dx, y + dy, gray, 2);
    drawIconLine(x - 7, y, x + 7, y, gray, 1);
    drawIconLine(x - 4, y + 5, x + 4, y + 5, gray, 1);
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
    char clipped[MEAL_LABEL_MAX] = {0};
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
