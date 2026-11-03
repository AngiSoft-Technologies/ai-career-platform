import { NextRequest, NextResponse } from "next/server";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "dev-internal-key";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${INTERNAL_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { url, task, context } = body as {
      url: string;
      task: "extract_job" | "extract_company" | "extract_contact" | "custom";
      context?: Record<string, unknown>;
    };

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Browse through our own extraction engine via the API
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "https://mboqara-api-angisoft.fly.dev/v1";

    const response = await fetch(`${apiUrl}/agent/browse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${INTERNAL_API_KEY}`,
      },
      body: JSON.stringify({ url, task, context }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: "Agent browse failed", details: error },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to run agent", details: String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ready",
    endpoints: {
      browse: "POST /api/agent/browse - Scrape and extract data from any URL",
    },
    tasks: ["extract_job", "extract_company", "extract_contact", "custom"],
  });
}