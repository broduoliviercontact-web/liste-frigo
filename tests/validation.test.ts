import assert from "node:assert/strict";
import test from "node:test";
import { agendaTime, boundedDuration, isoDate, text } from "../app/api/input-validation.ts";
import { normalizeEpaperSettings } from "../app/api/epaper-settings/settings.ts";

test("refuse les dates calendaires et heures impossibles", () => {
  assert.equal(isoDate("2026-02-29"), null);
  assert.equal(isoDate("2028-02-29"), "2028-02-29");
  assert.equal(agendaTime("24:00"), undefined);
  assert.equal(agendaTime("12:60"), undefined);
  assert.equal(agendaTime("09:30"), "09:30");
  assert.equal(agendaTime(null), null);
});

test("ne coerçe pas les corps JSON incorrects", () => {
  assert.equal(text(42, 80), null);
  assert.equal(text("  Rendez-vous   médecin ", 80), "Rendez-vous médecin");
  assert.equal(boundedDuration("30"), undefined);
  assert.equal(boundedDuration(7), undefined);
  assert.equal(boundedDuration(31), 30);
});

test("normalise les réglages e-paper vers un onglet réellement visible", () => {
  const settings = normalizeEpaperSettings({
    visibleTabs: ["iss", "inconnu", "iss"],
    activeTab: "agenda",
    preferredTab: "agenda",
    carousel: { enabled: true, intervalSeconds: 2 },
  });
  assert.deepEqual(settings.visibleTabs, ["iss"]);
  assert.equal(settings.activeTab, "iss");
  assert.equal(settings.preferredTab, "iss");
  assert.equal(settings.carousel.intervalSeconds, 30);
});
