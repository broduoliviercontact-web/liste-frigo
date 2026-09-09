import { requireSupervieAccess } from "../../access";

type AirTrafficPlane = {
  id: string;
  callsign: string;
  registration: string;
  tailNumber: string;
  airline: string;
  aircraftType: string;
  route: string;
  bearing: string;
  x: number;
  y: number;
  heading: number;
  altitudeM: number;
  speedKmh: number;
  distanceKm: number;
  flightLevel: string;
  past: Array<[number, number]>;
  future: Array<[number, number]>;
};

type AirTrafficSnapshot = {
  status: "ready";
  updatedAt: string;
  radiusKm: number;
  home: { label: string; latitude: number; longitude: number };
  scan: { refreshSeconds: number; mode: "simulation" };
  aircraft: AirTrafficPlane[];
};

const simulatedAircraft = [
  { callsign: "AFR76P", tailNumber: "F-GZNP", airline: "Air France", aircraftType: "Boeing 777", route: "CDG -> Montreal", baseX: 146, baseY: 84, dx: 22, dy: -15, speed: 812, altitude: 11300, phase: 0.1 },
  { callsign: "RYR32HA", tailNumber: "EI-EKD", airline: "Ryanair", aircraftType: "Boeing 737", route: "Beauvais -> Porto", baseX: 96, baseY: 130, dx: 34, dy: 4, speed: 692, altitude: 7900, phase: 1.3 },
  { callsign: "EJU49KT", tailNumber: "OE-IJZ", airline: "easyJet", aircraftType: "Airbus A320", route: "CDG -> Toulouse", baseX: 176, baseY: 164, dx: -29, dy: 30, speed: 468, altitude: 5200, phase: 2.1 },
  { callsign: "TVF1QD", tailNumber: "F-HTVC", airline: "Transavia", aircraftType: "Boeing 737", route: "Orly -> Lisbonne", baseX: 62, baseY: 190, dx: 26, dy: -32, speed: 744, altitude: 9600, phase: 2.9 },
  { callsign: "BAW8SG", tailNumber: "G-EUUT", airline: "British Airways", aircraftType: "Airbus A320", route: "Londres -> Geneve", baseX: 210, baseY: 106, dx: -24, dy: 26, speed: 785, altitude: 10800, phase: 3.8 },
  { callsign: "DAH108S", tailNumber: "7T-VKE", airline: "Air Algerie", aircraftType: "Boeing 737", route: "CDG -> Alger", baseX: 132, baseY: 128, dx: 10, dy: -38, speed: 421, altitude: 3400, phase: 4.6 },
  { callsign: "DLH7MC", tailNumber: "D-AIWI", airline: "Lufthansa", aircraftType: "Airbus A320", route: "Francfort -> Paris", baseX: 54, baseY: 76, dx: 40, dy: 21, speed: 706, altitude: 8800, phase: 5.2 },
  { callsign: "VLG42Z", tailNumber: "EC-MHA", airline: "Vueling", aircraftType: "Airbus A321", route: "Paris -> Barcelone", baseX: 224, baseY: 58, dx: -16, dy: 42, speed: 512, altitude: 6600, phase: 5.9 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function positionFor(plane: (typeof simulatedAircraft)[number], tick: number, offset = 0) {
  const t = tick / 8 + plane.phase + offset;
  const x = clamp(Math.round(plane.baseX + Math.sin(t) * plane.dx), 12, 243);
  const y = clamp(Math.round(plane.baseY + Math.cos(t * 0.92) * plane.dy), 12, 243);
  return { x, y };
}

function bearingFromHeading(heading: number) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(heading / 45) % directions.length];
}

function headingBetween(from: { x: number; y: number }, to: { x: number; y: number }) {
  return Math.round((Math.atan2(to.x - from.x, from.y - to.y) * 180 / Math.PI + 360) % 360);
}

export async function readAirTraffic(date = new Date()): Promise<AirTrafficSnapshot> {
  const tick = Math.floor(date.getTime() / 10_000);
  const aircraft = simulatedAircraft.map((plane) => {
    const previous = positionFor(plane, tick, -0.65);
    const current = positionFor(plane, tick);
    const next = positionFor(plane, tick, 0.65);
    const heading = headingBetween(previous, next);
    const distanceKm = Math.round(Math.hypot(current.x - 128, current.y - 128) / 128 * 80);
    const altitudeM = Math.max(700, Math.round(plane.altitude + Math.sin(tick / 6 + plane.phase) * 260));
    const speedKmh = Math.max(120, Math.round(plane.speed + Math.cos(tick / 5 + plane.phase) * 24));
    const past: Array<[number, number]> = [
      [positionFor(plane, tick, -1.95).x, positionFor(plane, tick, -1.95).y],
      [positionFor(plane, tick, -1.3).x, positionFor(plane, tick, -1.3).y],
      [previous.x, previous.y],
    ];
    const future: Array<[number, number]> = [
      [next.x, next.y],
      [positionFor(plane, tick, 1.3).x, positionFor(plane, tick, 1.3).y],
      [positionFor(plane, tick, 1.95).x, positionFor(plane, tick, 1.95).y],
    ];
    return {
      id: plane.callsign,
      callsign: plane.callsign,
      registration: plane.callsign,
      tailNumber: plane.tailNumber,
      airline: plane.airline,
      aircraftType: plane.aircraftType,
      route: plane.route,
      bearing: bearingFromHeading(heading),
      x: current.x,
      y: current.y,
      heading,
      altitudeM,
      speedKmh,
      distanceKm,
      flightLevel: `FL${String(Math.round(altitudeM / 30.48 / 100)).padStart(3, "0")}`,
      past,
      future,
    };
  });

  return {
    status: "ready",
    updatedAt: date.toISOString(),
    radiusKm: 80,
    home: { label: "Nous", latitude: 48.895, longitude: 2.409 },
    scan: { refreshSeconds: 10, mode: "simulation" },
    aircraft,
  };
}

export async function GET(request: Request) {
  const denied = await requireSupervieAccess(request);
  if (denied) return denied;
  return Response.json(await readAirTraffic(), { headers: { "Cache-Control": "no-store, max-age=0" } });
}
