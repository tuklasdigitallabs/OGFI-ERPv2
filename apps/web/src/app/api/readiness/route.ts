import { prisma } from "@ogfi/database";
import { NextResponse } from "next/server";
import {
  getEvidenceStorageStaticReadiness,
  readEvidenceStorageConfig,
} from "../../../server/services/evidenceStorageConfig";
import { createEvidenceStorageAdapters } from "../../../server/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const production =
    process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
  const staticStorage = getEvidenceStorageStaticReadiness();
  let database: "ok" | "unavailable" = "ok";

  try {
    await prisma.$queryRaw`select 1`;
  } catch {
    database = "unavailable";
  }

  let objectStorage: "ok" | "degraded" | "not_checked" =
    staticStorage.status;
  let malwareScan: "ok" | "degraded" | "not_checked" =
    staticStorage.status;
  const issueCodes = [...staticStorage.issues];
  const live =
    production || process.env.EVIDENCE_READINESS_LIVE_CHECK === "true";

  if (staticStorage.status === "ok") {
    try {
      const adapters = createEvidenceStorageAdapters(
        readEvidenceStorageConfig(),
      );
      const [storageReadiness, scanReadiness] = await Promise.all([
        adapters.objectStorage.checkReadiness({ live }),
        adapters.malwareScan.checkReadiness({ live }),
      ]);
      objectStorage = storageReadiness.status;
      malwareScan = scanReadiness.status;
      issueCodes.push(
        ...storageReadiness.issueCodes,
        ...scanReadiness.issueCodes,
      );
    } catch {
      objectStorage = "degraded";
      malwareScan = "degraded";
      issueCodes.push("EVIDENCE_STORAGE_READINESS_CHECK_FAILED");
    }
  }

  const degraded =
    database !== "ok" ||
    staticStorage.status !== "ok" ||
    objectStorage !== "ok" ||
    malwareScan !== "ok";
  return NextResponse.json(
    {
      status: degraded ? "degraded" : "ok",
      service: "web",
      releaseScope: "phase-i-phase-1-5-no-queueing",
      checks: {
        database,
        evidenceConfiguration: staticStorage.status,
        evidenceProviderClass: staticStorage.providerClass,
        evidenceProductionSafe: staticStorage.productionSafe,
        objectStorage,
        malwareScan,
        liveProviderChecks: live ? "performed" : "not_checked",
      },
      issueCodes: [...new Set(issueCodes)],
    },
    { status: degraded ? 503 : 200 },
  );
}
