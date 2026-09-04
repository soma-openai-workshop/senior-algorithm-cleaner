import { NextResponse } from "next/server";
import { portabilityFetch, responsePayload } from "@/lib/google";

export async function POST() {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const response = await portabilityFetch("/portabilityArchive:initiate", {
      method: "POST",
      body: JSON.stringify({
        resources: ["myactivity.youtube"],
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      }),
    });
    const payload = await responsePayload(response);
    return NextResponse.json({ ok: response.ok, upstreamStatus: response.status, payload }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 401 });
  }
}
