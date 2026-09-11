import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateEtaMinutes,
  distanceKm,
  knotsToKmh,
  normalizeAisMessage,
  pruneStaleBoats,
  vesselTypeLabel,
  type NormalizedBoat,
} from "../server/services/aisService.ts";

const home = { lat: 48.8936, lon: 2.4248 };

test("calcule une distance geographique locale", () => {
  const distance = distanceKm(home, { lat: 48.8936, lon: 2.4385 });
  assert.ok(distance > 0.9 && distance < 1.1);
});

test("convertit les noeuds en km/h", () => {
  assert.equal(knotsToKmh(10), 18.52);
});

test("traduit les principaux types de bateaux AIS", () => {
  assert.equal(vesselTypeLabel("70"), "Marchandises / péniche");
  assert.equal(vesselTypeLabel("52"), "Remorqueur");
  assert.equal(vesselTypeLabel(null), "Bateau AIS");
});

test("calcule un ETA pour un bateau qui approche", () => {
  const eta = calculateEtaMinutes({ lat: 48.8936, lon: 2.4385, speedKnots: 5, heading: 270 }, home);
  assert.ok(eta !== null && eta >= 6 && eta <= 7);
});

test("ne calcule pas d'ETA pour un bateau immobile", () => {
  assert.equal(calculateEtaMinutes({ lat: 48.8936, lon: 2.4385, speedKnots: 0.2, heading: 270 }, home), null);
});

test("ne calcule pas d'ETA pour un bateau qui s'eloigne", () => {
  assert.equal(calculateEtaMinutes({ lat: 48.8936, lon: 2.4385, speedKnots: 5, heading: 90 }, home), null);
});

test("ignore sans erreur les donnees AIS partielles", () => {
  assert.equal(normalizeAisMessage({ MessageType: "PositionReport", Message: { PositionReport: { Sog: 4 } } }), null);
  const boat = normalizeAisMessage({
    MessageType: "PositionReport",
    MetaData: { MMSI: 123456789, Latitude: 48.8936, Longitude: 2.43, ShipType: 70 },
    Message: { PositionReport: { Sog: 3, Cog: 270 } },
  }, new Date("2026-09-10T12:00:00Z"));
  assert.equal(boat?.name, "Bateau 123456789");
  assert.equal(boat?.heading, 270);
  assert.equal(boat?.vesselType, "70");
});

test("supprime les positions trop anciennes", () => {
  const boats = new Map<string, NormalizedBoat>([
    ["old", { id: "old", mmsi: "1", name: "Old", lat: 0, lon: 0, speedKnots: 1, heading: 0, vesselType: null, updatedAt: "2026-09-10T11:00:00Z" }],
    ["new", { id: "new", mmsi: "2", name: "New", lat: 0, lon: 0, speedKnots: 1, heading: 0, vesselType: null, updatedAt: "2026-09-10T11:59:00Z" }],
  ]);
  pruneStaleBoats(boats, Date.parse("2026-09-10T12:00:00Z"), 10 * 60_000);
  assert.deepEqual([...boats.keys()], ["new"]);
});
