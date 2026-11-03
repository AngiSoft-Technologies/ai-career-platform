import { NextRequest, NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET ?? "dev-secret";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "https://mboqara-api-angisoft.fly.dev/v1";

    // Trigger embedding refresh
    const embeddingResponse = await fetch(`${apiUrl}/embeddings/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.INTERNAL_API_KEY ?? ""}`,
      },
    });

    // Trigger AI insights generation for active users
    const insightsResponse = await fetch(`${apiUrl}/ai/insights/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.INTERNAL_API_KEY ?? ""}`,
      },
    });

    const [embeddingResult, insightsResult] = await Promise.all([
      embeddingResponse.json().catch(() => ({})),
      insightsResponse.json().catch(() => ({})),
    ]);

    return NextResponse.json({
      success: true,
      triggered: ["embeddings", "insights"],
      embedding: embeddingResult,
      insights: insightsResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to trigger AI tasks", details: String(error) },
      { status: 500 },
    );
  }
}