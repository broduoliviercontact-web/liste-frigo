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

Supported tab keys: `listes`, `creche`, `meteo`, `repas`, `metro`, `reglages`,
`iss`, `air`, `agenda`, `bateaux`.

`pages.bateaux` mirrors the lightweight `GET /api/boats` response. It contains
`status`, `updatedAt`, optional `route` metadata, and up to five entries with
`name`, `distanceKm`, `speedKmh`, `direction`, `etaMinutes`, and `updatedAt`.
The current firmware renders a static Canal de l'Ourcq map when `boats` is
empty, so a live empty result is normal and should not be converted into an
error. A missing or degraded AIS feed is represented by an empty `boats` array
and never prevents the rest of the e-paper state from loading.
