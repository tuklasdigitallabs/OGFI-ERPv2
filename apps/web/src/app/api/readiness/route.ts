import { prisma } from "@ogfi/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const missingConfig = ["DATABASE_URL", "S3_ENDPOINT"].filter((key) => !process.env[key]);

  try {
    await prisma.$queryRaw`select 1`;
  } catch {
    return NextResponse.json(
      {
        status: "error",
        service: "web",
        checks: {
          database: "unavailable",
          requiredConfig: missingConfig.length === 0 ? "ok" : "missing"
        }
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: missingConfig.length === 0 ? "ok" : "degraded",
    service: "web",
    releaseScope: "phase-i-phase-1-5-no-queueing",
    checks: {
      database: "ok",
      requiredConfig: missingConfig.length === 0 ? "ok" : "missing",
      missingConfig
    }
  });
}
