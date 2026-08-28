#pragma once

#include "ListeFrigoTypes.h"

class ListeFrigoDisplay {
public:
    bool begin();
    void showPage(NavTabId tab, bool clear_panel, const ListPageState *list_state = nullptr);
    void updateListItemToggle(int8_t visible_row, const ListPageState &list_state);
    void updateListWindow(const ListPageState &list_state);

private:
    uint8_t *logical_fb = nullptr;
    uint8_t *physical_fb = nullptr;
    uint8_t *partial_fb = nullptr;

    const ListPageState *current_list_state = nullptr;

    void drawPage(NavTabId tab, const ListPageState *list_state);
    void drawHeader(NavTabId tab);
    void drawListesPage(const ListPageState *list_state);
    void drawSimplePage(NavTabId tab);
    void drawNavBar(NavTabId selected_tab);
    void drawNavItem(NavTabId tab, bool selected);
    void drawListItem(int32_t y, const char *label, bool checked);
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
