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
        REQUEST_ADD_ITEM,
    };

    void begin();
    void poll(bool wifi_connected);
    void setSelectedListId(int32_t list_id);
    void requestStateRefresh();
    bool takeListState(ListPageState &target);
    bool takeGeneratedAt(char *target, size_t target_size);
    bool takeWeatherState(WeatherState &target);
    bool getCachedListState(int32_t list_id, ListPageState &target) const;
    bool sendToggleItem(int32_t item_id, bool checked);
    bool sendSelectList(int32_t list_id);
    bool sendAddItem(int32_t list_id, const char *label);
    void snapshotRequest(RequestKind &kind, int32_t &item_id, bool &checked, uint32_t &generation, int32_t &selected_list_id,
                         char *label, size_t label_size) const;
    void finishFetch(bool success, int http_code, size_t bytes, const char *message,
                     const char *active_tab, uint32_t list_count, uint32_t item_count,
                     const ListPageState *list_state, const ListPageState *list_cache,
                     int8_t list_cache_count, const char *generated_at,
                     const WeatherState *weather_state);
    void finishToggle(bool success, int http_code, size_t bytes, const char *message,
                      RequestKind kind, int32_t item_id, bool checked, uint32_t generation);
    void mergePendingToggles(ListPageState &remote_state);

private:
    State state = API_DISABLED;
    TaskHandle_t task_handle = nullptr;
    RequestKind request_kind = REQUEST_NONE;
    uint32_t next_fetch_ms = 0;
    uint32_t retry_delay_ms = 10000;
    struct PendingToggle {
        int32_t id = 0;
        bool desired_checked = false;
        bool dirty = false;
        bool in_flight = false;
        bool awaiting_confirmation = false;
        uint32_t generation = 0;
        uint32_t in_flight_generation = 0;
        uint32_t next_retry_ms = 0;
        uint8_t retry_count = 0;
    };

    static constexpr int8_t PENDING_TOGGLE_MAX = LIST_ITEM_COUNT;
    PendingToggle pending_toggles[PENDING_TOGGLE_MAX] = {};
    uint32_t next_toggle_generation = 0;
    int32_t selected_list_id = 0;
    uint32_t next_write_ms = 0;
    bool wifi_available = false;
    bool offline_wait_logged = false;
    int8_t active_toggle_slot = -1;
    int32_t toggle_item_id = 0;
    bool toggle_checked = false;
    uint32_t toggle_generation = 0;
    char add_label[LIST_LABEL_MAX] = {0};
    int32_t queued_toggle_item_id = 0;
    bool queued_toggle_checked = false;
    char queued_add_label[LIST_LABEL_MAX] = {0};
    RequestKind queued_request_kind = REQUEST_NONE;
    volatile bool request_in_flight = false;
    volatile bool result_ready = false;
    volatile bool toggle_result_ready = false;
    bool result_success = false;
    int result_http_code = 0;
    size_t result_bytes = 0;
    char result_message[96] = {0};
    char result_active_tab[16] = {0};
    char result_generated_at[32] = {0};
    uint32_t result_list_count = 0;
    uint32_t result_item_count = 0;
    ListPageState result_list_state = {};
    WeatherState result_weather_state = {};
    ListPageState cached_list_states[LIST_COUNT_MAX] = {};
    int8_t cached_list_count = 0;
    bool result_has_list_state = false;
    volatile bool list_state_available = false;
    volatile bool generated_at_available = false;
    volatile bool weather_state_available = false;

    void startFetch();
    void startToggle();
    void startAddItem();
    void startQueuedRequestIfAny();
    void consumeResult();
    void consumeToggleResult();
    void scheduleRetry();
    PendingToggle *findPendingToggle(int32_t item_id);
    PendingToggle *findOrCreatePendingToggle(int32_t item_id);
    void startNextToggle();
    bool hasPendingToggles() const;
    void deferToggleRetry(PendingToggle &pending);
};
