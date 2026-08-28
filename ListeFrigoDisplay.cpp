#include "ListeFrigoDisplay.h"

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

void ListeFrigoDisplay::updateListItemToggle(int8_t visible_row, const ListPageState &list_state)
{
    if (visible_row < 0 || visible_row >= VISIBLE_LIST_ROWS) {
        return;
    }

    Serial.println("Liste Frigo: mise a jour partielle item");
    drawPage(TAB_LISTES, &list_state);

    epd_poweron();
    updateLogicalArea({54, 170, 430, 56});
    updateLogicalArea({54, LIST_TOP_Y + visible_row * LIST_ROW_HEIGHT, 430, LIST_ROW_HEIGHT});
    epd_poweroff_all();
    Serial.println("Liste Frigo: mise a jour partielle terminee");
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

    drawHeader(tab);
    if (tab == TAB_LISTES) {
        drawListesPage(list_state);
    } else {
        drawSimplePage(tab);
    }

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
    int8_t remaining = 0;
    for (int8_t i = 0; i < state->item_count; ++i) {
        if (!state->items[i].checked) {
            ++remaining;
        }
    }

    char count[4] = {0};
    snprintf(count, sizeof(count), "%d", remaining);
    drawText(62, 176, count, 7, BLACK);
    drawText(96, 194, "articles a acheter", 3, BLACK);

    for (int8_t row = 0; row < VISIBLE_LIST_ROWS; ++row) {
        const int8_t item_index = state->scroll_offset + row;
        if (item_index >= state->item_count) {
            break;
        }
        drawListItem(LIST_TOP_Y + row * LIST_ROW_HEIGHT, state->items[item_index].label, state->items[item_index].checked);
    }
    drawScrollButtons(*state);

    if (state->item_count > VISIBLE_LIST_ROWS) {
        char range[16] = {0};
        snprintf(range, sizeof(range), "%d-%d/%d",
                 state->scroll_offset + 1,
                 min<int8_t>(state->scroll_offset + VISIBLE_LIST_ROWS, state->item_count),
                 state->item_count);
        drawText(412, 194, range, 3, DARK);
    }

    fillRect(32, 632, LOGICAL_WIDTH - 64, 4, BLACK);
    drawActionButton(62, 654, LOGICAL_WIDTH - 124, 54, "ECRIRE", true);
    drawActionButton(62, 724, 202, 46, "CLAVIER", false);
    drawActionButton(276, 724, 202, 46, "EFFACER", false);
    drawText(202, 800, "SYNCHRONISE", 3, BLACK);
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
    } else if (tab == TAB_CRECHE) {
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
            const int32_t physical_x = y;
            const int32_t physical_y = LOGICAL_WIDTH - 1 - x;
            setNibble(physical_fb, EPD_WIDTH, physical_x, physical_y, gray);
        }
    }
}

void ListeFrigoDisplay::drawListItem(int32_t y, const char *label, bool checked)
{
    drawRect(62, y + 7, 34, 34, 4, BLACK);
    if (checked) {
        fillRect(68, y + 13, 22, 22, BLACK);
        drawCheckMark(71, y + 16, WHITE);
    }
    drawTextLimited(128, y + 4, label, 5, checked ? DARK : BLACK, 285);
    fillRect(62, y + 52, 378, 2, BLACK);
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
    physical_area.x = logical_area.y;
    physical_area.y = LOGICAL_WIDTH - logical_area.x - logical_area.width;
    physical_area.width = logical_area.height;
    physical_area.height = logical_area.width;

    memset(partial_fb, 0xFF, packedBytes(physical_area.width, physical_area.height));
    for (int32_t py = 0; py < physical_area.height; ++py) {
        for (int32_t px = 0; px < physical_area.width; ++px) {
            const int32_t physical_x = physical_area.x + px;
            const int32_t physical_y = physical_area.y + py;
            const int32_t logical_x = LOGICAL_WIDTH - 1 - physical_y;
            const int32_t logical_y = physical_x;
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
