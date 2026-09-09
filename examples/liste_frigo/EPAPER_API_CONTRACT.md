# E-paper tabs API contract

The firmware keeps working when these fields are absent. Add them to
`GET /api/epaper/v1/state` when the website is ready to drive the new tabs.

```json
{
  "epaperSettings": {
    "visibleTabs": ["listes", "creche", "meteo", "iss", "air"],
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
    }
  }
}
```

Coordinates are normalized from `0` to `255` so the website can map ISS and
aircraft positions without knowing the physical e-paper resolution.

Supported tab keys: `listes`, `creche`, `meteo`, `repas`, `metro`, `reglages`,
`iss`, `air`.
