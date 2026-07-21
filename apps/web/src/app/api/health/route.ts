import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "web",
    releaseScope: "phase-i-phase-1-5-no-queueing",
    checks: {
      app: "ok",
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
      evidenceProviderConfigured: Boolean(
        process.env.EVIDENCE_STORAGE_PROVIDER,
      ),
      errorMonitoringConfigured: Boolean(process.env.ERROR_MONITORING_DSN)
    }
  });
}
