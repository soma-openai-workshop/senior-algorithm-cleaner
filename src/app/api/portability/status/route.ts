import { NextRequest, NextResponse } from "next/server";
import { portabilityFetch, responsePayload } from "@/lib/google";

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId || !/^[A-Za-z0-9._-]+$/.test(jobId)) {
    return NextResponse.json({ ok: false, error: "A valid jobId is required" }, { status: 400 });
  }

  try {
    const response = await portabilityFetch(`/archiveJobs/${encodeURIComponent(jobId)}/portabilityArchiveState`);
    const payload = await responsePayload(response);
    if (payload && typeof payload === "object" && "urls" in payload) {
      const urls = Array.isArray(payload.urls) ? payload.urls : [];
      payload.urls = urls.map((_: unknown, index: number) => `[signed download URL ${index + 1} hidden]`);
      payload.downloadUrlCount = urls.length;
    }
    return NextResponse.json({ ok: response.ok, upstreamStatus: response.status, payload }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 401 });
  }
}
