import { NextResponse } from "next/server";
import { portabilityFetch, responsePayload } from "@/lib/google";

export async function POST() {
  try {
    const response = await portabilityFetch("/accessType:check", { method: "POST", body: "{}" });
    const payload = await responsePayload(response);
    return NextResponse.json({ ok: response.ok, upstreamStatus: response.status, payload }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 401 });
  }
}
