import { requireSupervieAccess } from "../../access";
import { readBoats } from "../../../server/services/aisService";

export { readBoats };

export async function GET(request: Request) {
  const denied = await requireSupervieAccess(request);
  if (denied) return denied;
  try {
    return Response.json(await readBoats(), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error(`Bateaux API unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return Response.json({ status: "degraded", updatedAt: new Date().toISOString(), boats: [] });
  }
}
