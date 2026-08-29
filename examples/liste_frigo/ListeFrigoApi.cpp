#include "ListeFrigoApi.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "secrets.h"

namespace {

constexpr const char *EPAPER_STATE_URL = "https://liste-frigo.pliskain.chatgpt.site/api/epaper/v1/state";
constexpr const char *LISTS_API_URL = "https://liste-frigo.pliskain.chatgpt.site/api/lists";
constexpr uint32_t FIRST_FETCH_DELAY_MS = 3000;
constexpr uint32_t SUCCESS_FETCH_INTERVAL_MS = 15000;
constexpr uint32_t MAX_RETRY_DELAY_MS = 120000;
constexpr uint32_t HTTP_TIMEOUT_MS = 7000;

#if defined(EPAPER_BYPASS_TOKEN)
constexpr bool HAS_EPAPER_TOKEN = true;
#else
constexpr bool HAS_EPAPER_TOKEN = false;
#endif

void copyMessage(char *target, size_t target_size, const char *message)
{
    if (target_size == 0) {
        return;
    }
    strlcpy(target, message, target_size);
}

void copyLabel(char *target, const char *source)
{
    if (!source || !*source) {
        strlcpy(target, "item", LIST_LABEL_MAX);
        return;
    }

    strlcpy(target, source, LIST_LABEL_MAX);
}

void copyListName(char *target, const char *source)
{
    if (!source || !*source) {
        strlcpy(target, "Courses", LIST_NAME_MAX);
        return;
    }

    strlcpy(target, source, LIST_NAME_MAX);
}

void fetchTask(void *param)
{
    auto *client = static_cast<ListeFrigoApi *>(param);

    while (true) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        ListeFrigoApi::RequestKind kind = ListeFrigoApi::REQUEST_NONE;
        int32_t toggle_item_id = 0;
        bool toggle_checked = false;
        client->snapshotRequest(kind, toggle_item_id, toggle_checked);

        WiFiClientSecure secure_client;
        HTTPClient http;

        secure_client.setInsecure();
        http.setTimeout(HTTP_TIMEOUT_MS);
        http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

        int http_code = 0;
        String payload;
        bool success = false;
        char message[96] = {0};
        char active_tab[16] = {0};
        uint32_t list_count = 0;
        uint32_t item_count = 0;
        ListPageState fetched_list_state = {};
        bool has_list_state = false;
        const bool is_write_request = kind == ListeFrigoApi::REQUEST_TOGGLE_ITEM || kind == ListeFrigoApi::REQUEST_SELECT_LIST;
        const char *url = is_write_request ? LISTS_API_URL : EPAPER_STATE_URL;

        if (http.begin(secure_client, url)) {
            http.addHeader("Accept", "application/json");
#if defined(EPAPER_BYPASS_TOKEN)
            http.addHeader("OAI-Sites-Authorization", String("Bearer ") + EPAPER_BYPASS_TOKEN);
#endif
            if (is_write_request) {
                http.addHeader("Content-Type", "application/json");
                JsonDocument body;
                if (kind == ListeFrigoApi::REQUEST_TOGGLE_ITEM) {
                    body["action"] = "toggleItem";
                    body["id"] = toggle_item_id;
                    body["checked"] = toggle_checked;
                } else {
                    body["action"] = "selectList";
                    body["id"] = toggle_item_id;
                }
                String request_body;
                serializeJson(body, request_body);
                http_code = http.POST(request_body);
            } else {
                http_code = http.GET();
            }
            payload = http.getString();

            if (is_write_request) {
                if (http_code == HTTP_CODE_OK) {
                    success = true;
                    snprintf(message, sizeof(message), kind == ListeFrigoApi::REQUEST_TOGGLE_ITEM ? "toggle OK" : "select OK");
                } else {
                    snprintf(message, sizeof(message), "HTTP %d", http_code);
                }
            } else if (http_code == HTTP_CODE_OK) {
                JsonDocument doc;
                DeserializationError error = deserializeJson(doc, payload);
                if (error) {
                    snprintf(message, sizeof(message), "JSON invalide: %s", error.c_str());
                } else {
                    strlcpy(active_tab, doc["activeTab"] | "", sizeof(active_tab));
                    JsonArray lists = doc["pages"]["listes"]["lists"].as<JsonArray>();
                    list_count = lists.size();
                    for (JsonObject list : lists) {
                        item_count += list["items"].as<JsonArray>().size();
                    }

                    JsonObject active_list = doc["pages"]["listes"]["lists"][0].as<JsonObject>();
                    fetched_list_state.id = active_list["id"] | 0;
                    copyListName(fetched_list_state.name, active_list["name"] | "Courses");
                    int8_t copied_lists = 0;
                    for (JsonObject list : lists) {
                        if (copied_lists >= LIST_COUNT_MAX) {
                            break;
                        }
                        fetched_list_state.lists[copied_lists].id = list["id"] | 0;
                        copyListName(fetched_list_state.lists[copied_lists].name, list["name"] | "Liste");
                        ++copied_lists;
                    }
                    fetched_list_state.list_count = copied_lists;

                    JsonArray items = active_list["items"].as<JsonArray>();
                    int8_t copied_items = 0;
                    for (JsonObject item : items) {
                        if (copied_items >= LIST_ITEM_COUNT) {
                            break;
                        }
                        fetched_list_state.items[copied_items].id = item["id"] | 0;
                        copyLabel(fetched_list_state.items[copied_items].label, item["label"] | "item");
                        fetched_list_state.items[copied_items].checked = item["checked"] | false;
                        ++copied_items;
                    }
                    fetched_list_state.item_count = copied_items;
                    fetched_list_state.scroll_offset = 0;
                    has_list_state = !active_list.isNull();

                    success = true;
                    snprintf(message, sizeof(message), "JSON OK");
                }
            } else {
                snprintf(message, sizeof(message), "HTTP %d", http_code);
            }
            http.end();
        } else {
            copyMessage(message, sizeof(message), "HTTP begin impossible");
        }

        if (is_write_request) {
            client->finishToggle(success, http_code, payload.length(), message);
        } else {
            client->finishFetch(success, http_code, payload.length(), message, active_tab, list_count, item_count,
                                has_list_state ? &fetched_list_state : nullptr);
        }
    }
}

} // namespace

void ListeFrigoApi::begin()
{
    if (!HAS_EPAPER_TOKEN) {
        Serial.println("API: EPAPER_BYPASS_TOKEN absent dans secrets.h, client en attente");
        state = API_DISABLED;
        return;
    }

    BaseType_t created = xTaskCreatePinnedToCore(fetchTask, "epaper_api", 12288, this, 1, &task_handle, 0);
    if (created != pdPASS) {
        Serial.println("API: erreur creation tache HTTP au demarrage");
        state = API_DISABLED;
        return;
    }

    Serial.println("API: client e-paper pret");
    state = API_IDLE;
    next_fetch_ms = millis() + FIRST_FETCH_DELAY_MS;
}

void ListeFrigoApi::poll(bool wifi_connected)
{
    if (state == API_DISABLED) {
        return;
    }

    if (toggle_result_ready) {
        consumeToggleResult();
    }

    if (result_ready) {
        consumeResult();
    }

    if (!wifi_connected || state == API_FETCHING || millis() < next_fetch_ms) {
        return;
    }

    startFetch();
}

bool ListeFrigoApi::takeListState(ListPageState &target)
{
    if (!list_state_available) {
        return false;
    }

    target = result_list_state;
    list_state_available = false;
    return true;
}

bool ListeFrigoApi::sendToggleItem(int32_t item_id, bool checked)
{
    if (state == API_DISABLED || task_handle == nullptr || item_id <= 0) {
        Serial.println("API: toggle item non envoye, client indisponible ou id absent");
        return false;
    }

    if (request_in_flight) {
        queued_toggle_item_id = item_id;
        queued_toggle_checked = checked;
        queued_request_kind = REQUEST_TOGGLE_ITEM;
        Serial.printf("API: toggle mis en attente id=%ld checked=%s\n",
                      static_cast<long>(item_id),
                      checked ? "true" : "false");
        return true;
    }

    toggle_item_id = item_id;
    toggle_checked = checked;
    startToggle();
    return true;
}

bool ListeFrigoApi::sendSelectList(int32_t list_id)
{
    if (state == API_DISABLED || task_handle == nullptr || list_id <= 0) {
        Serial.println("API: select liste non envoye, client indisponible ou id absent");
        return false;
    }

    if (request_in_flight) {
        queued_toggle_item_id = list_id;
        queued_toggle_checked = false;
        queued_request_kind = REQUEST_SELECT_LIST;
        Serial.printf("API: selection liste mise en attente id=%ld\n", static_cast<long>(list_id));
        return true;
    }

    toggle_item_id = list_id;
    toggle_checked = false;
    Serial.printf("API: POST select liste id=%ld\n", static_cast<long>(toggle_item_id));
    request_kind = REQUEST_SELECT_LIST;
    request_in_flight = true;
    toggle_result_ready = false;
    state = API_FETCHING;
    xTaskNotifyGive(task_handle);
    return true;
}

void ListeFrigoApi::snapshotRequest(RequestKind &kind, int32_t &item_id, bool &checked) const
{
    kind = request_kind;
    item_id = toggle_item_id;
    checked = toggle_checked;
}

void ListeFrigoApi::finishFetch(bool success, int http_code, size_t bytes, const char *message,
                                const char *active_tab, uint32_t list_count, uint32_t item_count,
                                const ListPageState *list_state)
{
    result_http_code = http_code;
    result_bytes = bytes;
    result_success = success;
    result_list_count = list_count;
    result_item_count = item_count;
    copyMessage(result_message, sizeof(result_message), message);
    copyMessage(result_active_tab, sizeof(result_active_tab), active_tab);
    result_has_list_state = success && list_state != nullptr;
    if (result_has_list_state) {
        result_list_state = *list_state;
    }
    result_ready = true;
    request_in_flight = false;
}

void ListeFrigoApi::startFetch()
{
    if (request_in_flight || task_handle == nullptr) {
        return;
    }

    Serial.println("API: GET /api/epaper/v1/state");
    request_kind = REQUEST_FETCH_STATE;
    request_in_flight = true;
    result_ready = false;
    state = API_FETCHING;
    xTaskNotifyGive(task_handle);
}

void ListeFrigoApi::startToggle()
{
    Serial.printf("API: POST toggle item id=%ld checked=%s\n",
                  static_cast<long>(toggle_item_id),
                  toggle_checked ? "true" : "false");
    request_kind = REQUEST_TOGGLE_ITEM;
    request_in_flight = true;
    toggle_result_ready = false;
    state = API_FETCHING;
    xTaskNotifyGive(task_handle);
}

void ListeFrigoApi::startQueuedRequestIfAny()
{
    if (queued_request_kind == REQUEST_NONE || request_in_flight) {
        return;
    }

    toggle_item_id = queued_toggle_item_id;
    toggle_checked = queued_toggle_checked;
    const RequestKind next_kind = queued_request_kind;
    queued_request_kind = REQUEST_NONE;
    if (next_kind == REQUEST_SELECT_LIST) {
        Serial.printf("API: POST select liste id=%ld\n", static_cast<long>(toggle_item_id));
        request_kind = REQUEST_SELECT_LIST;
        request_in_flight = true;
        toggle_result_ready = false;
        state = API_FETCHING;
        xTaskNotifyGive(task_handle);
    } else {
        startToggle();
    }
}

void ListeFrigoApi::finishToggle(bool success, int http_code, size_t bytes, const char *message)
{
    result_http_code = http_code;
    result_bytes = bytes;
    result_success = success;
    copyMessage(result_message, sizeof(result_message), message);
    toggle_result_ready = true;
    request_in_flight = false;
}

void ListeFrigoApi::consumeResult()
{
    result_ready = false;

    if (result_success) {
        Serial.printf(
            "API: succes HTTP %d, %u octets, activeTab=%s, listes=%lu, items=%lu\n",
            result_http_code,
            static_cast<unsigned int>(result_bytes),
            result_active_tab,
            static_cast<unsigned long>(result_list_count),
            static_cast<unsigned long>(result_item_count)
        );
        retry_delay_ms = 10000;
        state = API_IDLE;
        next_fetch_ms = millis() + SUCCESS_FETCH_INTERVAL_MS;
        if (result_has_list_state && queued_request_kind == REQUEST_NONE) {
            list_state_available = true;
        } else if (result_has_list_state) {
            Serial.println("API: etat distant ignore, ecriture locale en attente");
        }
        startQueuedRequestIfAny();
        return;
    }

    Serial.printf("API: echec %s, %u octets\n", result_message, static_cast<unsigned int>(result_bytes));
    scheduleRetry();
    startQueuedRequestIfAny();
}

void ListeFrigoApi::consumeToggleResult()
{
    toggle_result_ready = false;

    if (result_success) {
        Serial.printf("API: toggle envoye HTTP %d, %u octets\n",
                      result_http_code,
                      static_cast<unsigned int>(result_bytes));
        retry_delay_ms = 10000;
        state = API_IDLE;
        next_fetch_ms = millis() + 1000;
        startQueuedRequestIfAny();
        return;
    }

    Serial.printf("API: echec ecriture %s, %u octets\n", result_message, static_cast<unsigned int>(result_bytes));
    state = API_IDLE;
    next_fetch_ms = millis() + 5000;
    startQueuedRequestIfAny();
}

void ListeFrigoApi::scheduleRetry()
{
    state = API_WAITING_RETRY;
    next_fetch_ms = millis() + retry_delay_ms;
    Serial.printf("API: prochaine tentative dans %lu ms\n", static_cast<unsigned long>(retry_delay_ms));
    retry_delay_ms = min(retry_delay_ms * 2, MAX_RETRY_DELAY_MS);
}
