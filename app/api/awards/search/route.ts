import { NextRequest, NextResponse } from "next/server";
import { select, DEMO_USER_ID } from "@/lib/db";
import {
  findAirport,
  chartsFor,
  liveAvailability,
  CABINS,
  type Cabin,
} from "@/lib/awards";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const fromQuery = params.get("from") || "";
  const toQuery = params.get("to") || "";
  const date = params.get("date") || "";
  const cabinRaw = (params.get("cabin") || "economy").toLowerCase();
  const cabin: Cabin = (CABINS as string[]).includes(cabinRaw)
    ? (cabinRaw as Cabin)
    : "economy";

  if (!fromQuery || !toQuery) {
    return NextResponse.json(
      { error: "Both 'from' and 'to' are required." },
      { status: 400 }
    );
  }

  try {
    const [origin, destination] = await Promise.all([
      findAirport(fromQuery),
      findAirport(toQuery),
    ]);

    if (!origin) {
      return NextResponse.json(
        { error: `Could not find an airport matching "${fromQuery}".` },
        { status: 404 }
      );
    }
    if (!destination) {
      return NextResponse.json(
        { error: `Could not find an airport matching "${toQuery}".` },
        { status: 404 }
      );
    }

    const charts = await chartsFor(origin.region, destination.region, cabin);

    // Overlay the user's actual balances so the answer is "can I book this",
    // not just "what does it cost".
    const balances = await select(
      "user_points",
      `user_id=eq.${DEMO_USER_ID}&select=program_id,total_points`
    );
    const balanceByProgram: Record<number, number> = {};
    for (const b of balances) balanceByProgram[b.program_id] = b.total_points ?? 0;

    const chartsWithBalance = charts.map((c) => {
      const held = balanceByProgram[c.programId] ?? null;
      return {
        ...c,
        userBalance: held,
        shortfall: held != null ? Math.max(0, c.pointsOneWay - held) : null,
      };
    });

    const live = date
      ? await liveAvailability(origin.iata, destination.iata, date, cabin)
      : {
          status: "disabled" as const,
          message: "Pick a date to check live seat availability.",
          results: [],
        };

    return NextResponse.json({
      origin,
      destination,
      date: date || null,
      cabin,
      charts: chartsWithBalance,
      live: live.results,
      liveStatus: live.status,
      liveMessage: live.message,
    });
  } catch (err: any) {
    console.error("Award search error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
