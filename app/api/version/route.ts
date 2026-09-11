import { APP_VERSION } from "../../version";
import { requireSupervieAccess } from "../../access";
export async function GET(request: Request) {
  const denied = await requireSupervieAccess(request);
  return denied ?? Response.json({ version: APP_VERSION, schemaVersion: 1 }, { headers: { "Cache-Control": "no-store" } });
}
