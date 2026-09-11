# E-paper tabs API contract

The firmware keeps working when these fields are absent. Add them to
`GET /api/epaper/v1/state` when the website is ready to drive the new tabs.

```json
{
  "epaperSettings": {
    "visibleTabs": ["listes", "creche", "meteo", "repas", "metro", "agenda", "iss", "air", "bateaux"],
    "activeTab": "iss",
    "preferredTab": "listes",
    "carousel": {
      "enabled": false,
      "intervalSeconds": 120
    }
  },
  "pages": {
    "iss": {
      "status": "ready",
      "speedKmh": 27598,
      "over": "North Pacific Ocean",
      "position": { "x": 245, "y": 112 },
      "track": [
        { "x": 12, "y": 118 },
        { "x": 62, "y": 158 },
        { "x": 126, "y": 180 }
      ],
      "pastTrack": [
        { "x": 245, "y": 112 },
        { "x": 210, "y": 146 },
        { "x": 168, "y": 174 }
      ],
      "futureTrack": [
        { "x": 245, "y": 112 },
        { "x": 286, "y": 78 },
        { "x": 334, "y": 55 }
      ]
    },
    "air": {
      "status": "ready",
      "radiusKm": 25,
      "aircraft": [
        {
          "callsign": "AFR76P",
          "tailNumber": "F-GZNP",
          "airline": "Air France",
          "aircraftType": "Boeing 777",
          "route": "CDG > Montreal",
          "bearing": "NE",
          "distanceKm": 31,
          "altitudeM": 11300,
          "speedKmh": 812,
          "x": 146,
          "y": 84,
          "heading": 45
        }
      ]
    },
    "bateaux": {
      "status": "ok",
      "updatedAt": "2026-09-11T06:11:19.169Z",
      "route": {
        "name": "Canal de l'Ourcq",
        "from": "Paris",
        "to": "Bondy",
        "distanceKm": 8,
        "homeLabel": "Chez nous",
        "homeStop": "Raymond Queneau",
        "stops": [
          { "label": "La Villette", "km": 0 },
          { "label": "Pantin", "km": 2 },
          { "label": "Raymond Queneau", "km": 4 },
          { "label": "Bobigny", "km": 6 },
          { "label": "Bondy", "km": 8 }
        ]
      },
      "boats": [
        {
          "id": "ship-123",
          "name": "PENICHE",
          "mmsi": "123456789",
          "distanceKm": 1.2,
          "speedKmh": 6,
          "direction": "PARIS",
          "etaMinutes": 12,
          "updatedAt": "2026-09-11T06:11:19.169Z"
        }
      ]
    }
  }
}
```

Coordinates are normalized from `0` to `255` so the website can map ISS and
aircraft positions without knowing the physical e-paper resolution. `track`
is kept for firmware compatibility; newer firmware uses `pastTrack` for the
dotted previous orbit and `futureTrack` for the solid predicted orbit.

`pages.metro` has `status: "ready"`, an `updatedAt` timestamp, and `lines`.
Each available line has `directions`; every direction has a `destination` and
`minutes`, an array of JSON **integer numbers** from 0 to 180 (for example
`[3, 7, 12]`). `0` alone means a real departure at the platform. A missing,
textual, fractional, negative, or out-of-range value is invalid data: firmware
ignores that direction and must not display it as `A QUAI`.

Supported tab keys: `listes`, `creche`, `meteo`, `repas`, `metro`, `reglages`,
`iss`, `air`, `agenda`, `bateaux`.

`pages.bateaux` mirrors the lightweight `GET /api/boats` response. It contains
`status`, `updatedAt`, optional `route` metadata, and up to five entries with
`name`, `distanceKm`, `speedKmh`, `direction`, `etaMinutes`, and `updatedAt`.
The current firmware renders a static Canal de l'Ourcq map when `boats` is
empty, so a live empty result is normal and should not be converted into an
error. A missing or degraded AIS feed is represented by an empty `boats` array
and never prevents the rest of the e-paper state from loading.

For `pages.listes`, the server sends at most eight lists and 24 items per list.
Each list includes `remainingCount` (the full number of unchecked items) and
`overflow` (items omitted from the device payload); `pages.listes.overflow`
counts omitted lists. Current firmware displays these values so a partial list
is never mistaken for a complete one.

## Reliability release 2026-09-11-reliability-1

The local firmware expires Metro after 45 seconds without a fresh ready state;
explicit unavailable snapshots clear Metro and ISS immediately. This needs
physical verification after installation.

Keyboard additions use POST /api/lists with x-supervie-mutation-id. Eight
intentions are persisted in NVS before transmission; labels and keys only,
never credentials. Replays retain the exact key and sent content. Expiration
is 24 hours from the server-derived creation time, at most four attempts;
refused/uncertain/expired entries remain until explicitly acknowledged. The
list picker offers two-step acknowledgement after checking the lists on the
site; acknowledgement only removes blocked history, never resends an action.
Storage failure or a full queue refuses the new addition and keeps the input.
An authenticated state must establish server time before additions can resume.

ISS sourceUpdatedAt/sourceAgeSeconds/degraded describe the orbital source,
separately from the calculation timestamp. Site settings writes now require a
revision from GET /api/epaper-settings; a stale write returns 409. The firmware
only reads these settings and needs no write-protocol change.
