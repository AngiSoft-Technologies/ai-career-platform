import { NextRequest, NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET ?? "dev-secret";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Trigger the API's ingestion endpoint
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "https://mboqara-api-angisoft.fly.dev/v1";

    const response = await fetch(`${apiUrl}/ingestion/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.INTERNAL_API_KEY ?? ""}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: "Ingestion trigger failed", details: error },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      triggered: "ingestion",
      result: data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to trigger ingestion", details: String(error) },
      { status: 500 },
    );
  }
}