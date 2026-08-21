import { NextRequest } from "next/server";
import { json } from "@/lib/extensionCors";
import { getPrograms } from "@/lib/extensionService";

export async function GET(req: NextRequest) {
  try {
    const programs = await getPrograms();

    return json(200, {
      programs: programs.map((p: any) => ({
        id: p.id,
        program_code: p.program_code,
        program_name: p.program_name,
        partner_type: p.partner_type,
      })),
    });
  } catch (err: any) {
    return json(500, { error: err.message });
  }
}
