#pragma once

#include <Arduino.h>
#include "ListeFrigoTypes.h"

class ListeFrigoApi {
public:
    enum State {
        API_DISABLED,
        API_IDLE,
        API_FETCHING,
        API_WAITING_RETRY,
    };

    enum RequestKind {
        REQUEST_NONE,
        REQUEST_FETCH_STATE,
        REQUEST_TOGGLE_ITEM,
        REQUEST_SELECT_LIST,
    };

    void begin();
    void poll(bool wifi_connected);
    bool takeListState(ListPageState &target);
    bool sendToggleItem(int32_t item_id, bool checked);
    bool sendSelectList(int32_t list_id);
    void snapshotRequest(RequestKind &kind, int32_t &item_id, bool &checked) const;
    void finishFetch(bool success, int http_code, size_t bytes, const char *message,
                     const char *active_tab, uint32_t list_count, uint32_t item_count,
                     const ListPageState *list_state);
    void finishToggle(bool success, int http_code, size_t bytes, const char *message);

private:
    State state = API_DISABLED;
    TaskHandle_t task_handle = nullptr;
    RequestKind request_kind = REQUEST_NONE;
    uint32_t next_fetch_ms = 0;
    uint32_t retry_delay_ms = 10000;
    int32_t toggle_item_id = 0;
    bool toggle_checked = false;
    int32_t queued_toggle_item_id = 0;
    bool queued_toggle_checked = false;
    RequestKind queued_request_kind = REQUEST_NONE;
    volatile bool request_in_flight = false;
    volatile bool result_ready = false;
    volatile bool toggle_result_ready = false;
    bool result_success = false;
    int result_http_code = 0;
    size_t result_bytes = 0;
    char result_message[96] = {0};
    char result_active_tab[16] = {0};
    uint32_t result_list_count = 0;
    uint32_t result_item_count = 0;
    ListPageState result_list_state = {};
    bool result_has_list_state = false;
    volatile bool list_state_available = false;

    void startFetch();
    void startToggle();
    void startQueuedRequestIfAny();
    void consumeResult();
    void consumeToggleResult();
    void scheduleRetry();
};
