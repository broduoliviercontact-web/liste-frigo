/**
 * Liste Frigo - local e-paper prototype.
 *
 * Static portrait UI, GT911 navigation, Wi-Fi and API logging, no deep sleep.
 */

#ifndef BOARD_HAS_PSRAM
#error "Please enable PSRAM !!!"
#endif

#include <Arduino.h>
#include "ListeFrigoDisplay.h"
#include "ListeFrigoTouch.h"
#include "ListeFrigoWifi.h"
#include "ListeFrigoApi.h"

ListeFrigoDisplay display;
ListeFrigoTouch touch_nav;
ListeFrigoWifi wifi;
ListeFrigoApi api;
NavTabId active_tab = TAB_LISTES;
uint32_t last_preview_ms = 0;
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
    LIST_ITEM_COUNT,
    0,
};

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

void applyApiListState()
{
    ListPageState remote_state = {};
    if (!api.takeListState(remote_state)) {
        return;
    }

    if (sameListState(list_state, remote_state)) {
        Serial.println("API: liste recue sans changement");
        return;
    }

    const int8_t max_offset = max<int8_t>(0, remote_state.item_count - VISIBLE_LIST_ROWS);
    remote_state.scroll_offset = min<int8_t>(list_state.scroll_offset, max_offset);
    list_state = remote_state;
    Serial.printf("API: liste appliquee localement, items=%d\n", list_state.item_count);

    if (active_tab == TAB_LISTES) {
        Serial.println("API: changement site detecte, rafraichissement e-paper");
        display.showPage(active_tab, true, &list_state);
        emitPreviewState("api");
    }
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
    display.updateListWindow(list_state);
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
    display.updateListItemToggle(item_index - list_state.scroll_offset, list_state);
    emitPreviewState("toggle");
    api.sendToggleItem(list_state.items[item_index].id, checked);
    return true;
}

void setup()
{
    Serial.begin(115200);
    delay(1000);
    Serial.println("Liste Frigo: demarrage");

    if (!display.begin()) {
        while (true) {
            delay(1000);
        }
    }

    touch_nav.begin();
    api.begin();
    display.showPage(active_tab, true, &list_state);
    emitPreviewState("boot");
    wifi.begin();
}

void loop()
{
    wifi.poll();
    api.poll(wifi.isConnected());
    applyApiListState();

    if (millis() - last_preview_ms > 5000) {
        emitPreviewState("heartbeat");
    }

    TouchEvent event;
    if (!touch_nav.poll(event)) {
        delay(10);
        return;
    }

    logTouchEvent(event);
    if (handleListGesture(event)) {
        return;
    }

    if (event.kind != TOUCH_TAP) {
        return;
    }

    if (event.tab == TAB_NONE) {
        return;
    }

    if (event.tab == active_tab) {
        Serial.printf("Liste Frigo: onglet deja actif %s, aucun rafraichissement\n", navSerialName(active_tab));
        return;
    }

    active_tab = event.tab;
    display.showPage(active_tab, true, &list_state);
    emitPreviewState("tab");
}
