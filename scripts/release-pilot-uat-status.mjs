import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { evidenceRunId } from "./release-evidence-metadata.mjs";

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = process.env.RELEASE_EVIDENCE_ROOT ?? "release-evidence";
const runId = evidenceRunId(process.env, timestamp);
const uatEvidenceFile =
  process.env.RELEASE_UAT_EVIDENCE_FILE ??
  "docs/core/07-quality/PHASE1_PHASE1_5_UAT_EVIDENCE_PACK.md";
const outputFile =
  process.env.RELEASE_PILOT_UAT_STATUS_OUTPUT_FILE ??
  join(evidenceRoot, "pilot-uat-status", `pilot-uat-status-${timestamp}.txt`);

const artifactChecks = [
  {
    label: "Pilot readiness preflight",
    directory: "pilot-readiness",
    pattern: /^pilot-readiness-preflight-.*\.txt$/,
    requiredAny: [
      "RESULT | PASS | Pilot readiness prerequisites are configured.",
      "RESULT | WARN | Pilot readiness prerequisites are incomplete; no database checks were attempted.",
    ],
    severity: "High",
    owner: "QA Lead / Operations Lead",
    evidence: "DATABASE_URL, psql availability, and pilot threshold preflight result",
  },
  {
    label: "DB-backed pilot readiness report",
    directory: "pilot-readiness",
    pattern: /^pilot-readiness-(?!preflight).*\.txt$/,
    requiredAll: [
      "OGFI ERP Phase I / Phase 1.5 pilot readiness check",
      "RESULT | PASS | Pilot setup is ready for UAT execution evidence capture.",
    ],
    severity: "Critical",
    owner: "QA Lead / Operations Lead",
    evidence: "DB-backed pilot-readiness report against the selected pilot or staging database",
  },
  {
    label: "UAT status report",
    directory: "uat-status",
    pattern: /^uat-status-.*\.txt$/,
    requiredAll: [
      "OGFI ERP Phase I / Phase 1.5 UAT evidence status",
      "RESULT | PASS | UAT evidence pack has no unresolved execution placeholders.",
    ],
    severity: "Critical",
    owner: "QA Lead",
    evidence: "passing UAT status report after scenario rows and focused evidence are completed",
  },
];

const lines = [
  "OGFI ERP Phase I / Phase 1.5 pilot and UAT readiness status",
  `Generated UTC: ${timestamp}`,
  `Evidence run ID: ${runId}`,
  `Evidence root: ${evidenceRoot}`,
  `UAT evidence file: ${uatEvidenceFile}`,
  "",
  "This report is advisory. It does not run pilot setup checks, execute UAT, alter UAT evidence, or approve release.",
  "",
  "Artifact Gates",
];

let blockers = 0;
const artifactResults = new Map();

for (const check of artifactChecks) {
  const result = evaluateArtifact(check);
  artifactResults.set(check.label, result);
  if (result.pass) {
    lines.push(`PASS | ${check.label} | ${result.detail}`);
    for (const metadataLine of formatMetadataLines(result.metadata)) {
      lines.push(`  ${metadataLine}`);
    }
  } else {
    blockers += 1;
    lines.push(`BLOCKED | ${check.label} | ${result.detail}`);
    lines.push(
      `  OWNER | severity=${check.severity} | owner=${check.owner} | evidence=${check.evidence}`,
    );
  }
}

lines.push("", "Evidence Recency Gates");
const recencyResult = evaluatePilotUatRecency(
  artifactResults.get("DB-backed pilot readiness report"),
  artifactResults.get("UAT status report"),
);
if (recencyResult.status === "SKIP") {
  lines.push(`SKIP | Pilot readiness / UAT recency | ${recencyResult.detail}`);
} else if (recencyResult.pass) {
  lines.push(`PASS | Pilot readiness / UAT recency | ${recencyResult.detail}`);
} else {
  blockers += 1;
  lines.push(`BLOCKED | Pilot readiness / UAT recency | ${recencyResult.detail}`);
  lines.push(
    "  OWNER | severity=Critical | owner=QA Lead / Operations Lead | evidence=rerun UAT status after DB-backed pilot readiness for the selected pilot/staging scope",
  );
}

lines.push("", "Evidence Session Gates");
const sessionResult = evaluatePilotUatSession(
  artifactResults.get("DB-backed pilot readiness report"),
  artifactResults.get("UAT status report"),
);
if (sessionResult.status === "SKIP") {
  lines.push(`SKIP | Pilot readiness / UAT evidence run | ${sessionResult.detail}`);
} else if (sessionResult.pass) {
  lines.push(`PASS | Pilot readiness / UAT evidence run | ${sessionResult.detail}`);
} else {
  blockers += 1;
  lines.push(`BLOCKED | Pilot readiness / UAT evidence run | ${sessionResult.detail}`);
  lines.push(
    "  OWNER | severity=Critical | owner=QA Lead / Operations Lead | evidence=rerun DB-backed pilot readiness and UAT status in the same evidence run",
  );
}

lines.push("", "UAT Evidence File");
const documentResult = evaluateUatDocument(uatEvidenceFile);
if (documentResult.pass) {
  lines.push(`PASS | UAT evidence placeholders cleared | ${documentResult.detail}`);
} else {
  blockers += 1;
  lines.push(`BLOCKED | UAT evidence placeholders cleared | ${documentResult.detail}`);
  lines.push(
    "  OWNER | severity=Critical | owner=QA Lead / Operations Lead | evidence=completed UAT evidence pack with tester, result, evidence reference, defect/waiver disposition, and signoff",
  );
}

lines.push("");
if (blockers > 0) {
  lines.push(
    `RESULT | BLOCKED | ${blockers} pilot or UAT evidence blocker(s) remain before pilot acceptance can be reviewed.`,
  );
  lines.push(
    "Next action: run DB-backed pilot readiness against the selected pilot/staging database, complete UAT evidence, rerun UAT status, and capture owner signoff.",
  );
} else {
  lines.push(
    "RESULT | PASS | Pilot setup and UAT evidence are ready for release review.",
  );
}

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`Pilot/UAT readiness status written: ${outputFile}`);

function evaluateArtifact(check) {
  const directory = join(evidenceRoot, check.directory);
  if (!existsSync(directory)) {
    return { pass: false, detail: `missing directory: ${directory}` };
  }

  const matchingFiles = readdirSync(directory)
    .filter((file) => check.pattern.test(file))
    .sort();

  if (matchingFiles.length === 0) {
    return { pass: false, detail: `no matching artifact in ${directory}` };
  }

  const passingFile = matchingFiles.toReversed().find((file) => {
    const content = readFileSync(join(directory, file), "utf8");
    const allPass =
      !check.requiredAll?.length ||
      check.requiredAll.every((required) => content.includes(required));
    const anyPass =
      !check.requiredAny?.length ||
      check.requiredAny.some((required) => content.includes(required));

    return allPass && anyPass;
  });

  if (passingFile) {
    const filePath = join(directory, passingFile);
    return {
      pass: true,
      detail: passingFile,
      file: filePath,
      generatedAt: generatedAtFromContent(readFileSync(filePath, "utf8")),
      metadata: extractArtifactMetadata(filePath),
    };
  }

  const latestFile = matchingFiles.at(-1);
  const filePath = join(directory, latestFile);
  return {
    pass: false,
    detail: `latest matching artifact ${latestFile} is missing: ${missingMarkers(
      filePath,
      check,
    ).join(", ")}`,
    file: filePath,
    generatedAt: generatedAtFromContent(readFileSync(filePath, "utf8")),
    metadata: extractArtifactMetadata(filePath),
  };
}

function evaluatePilotUatRecency(pilotReadiness, uatStatus) {
  if (!pilotReadiness?.pass || !uatStatus?.pass) {
    return {
      status: "SKIP",
      detail: "requires passing DB-backed pilot readiness and passing UAT status artifacts",
    };
  }

  if (!pilotReadiness.generatedAt || !uatStatus.generatedAt) {
    return {
      pass: false,
      detail: "missing Generated UTC metadata in one or more artifacts",
    };
  }

  if (uatStatus.generatedAt >= pilotReadiness.generatedAt) {
    return {
      pass: true,
      detail: `uat_status_generated=${formatDate(uatStatus.generatedAt)} | pilot_readiness_generated=${formatDate(pilotReadiness.generatedAt)}`,
    };
  }

  return {
    pass: false,
    detail: `uat_status_generated=${formatDate(uatStatus.generatedAt)} is older than pilot_readiness_generated=${formatDate(pilotReadiness.generatedAt)}`,
  };
}

function evaluatePilotUatSession(pilotReadiness, uatStatus) {
  if (!pilotReadiness?.pass || !uatStatus?.pass) {
    return {
      status: "SKIP",
      detail: "requires passing DB-backed pilot readiness and passing UAT status artifacts",
    };
  }

  const pilotRunId = pilotReadiness.metadata.evidenceRunId;
  const uatRunId = uatStatus.metadata.evidenceRunId;
  if (!pilotRunId || !uatRunId) {
    return {
      pass: false,
      detail: "evidence run IDs are not recorded in one or more artifacts",
    };
  }

  if (pilotRunId !== uatRunId) {
    return {
      pass: false,
      detail: `pilot_evidence_run_id=${pilotRunId} | uat_evidence_run_id=${uatRunId}`,
    };
  }

  return {
    pass: true,
    detail: `evidence_run_id=${pilotRunId}`,
  };
}

function generatedAtFromContent(content) {
  const match = content.match(/^Generated UTC:\s*(\d{8}T\d{6}Z)\s*$/m);
  if (!match) {
    return null;
  }

  return parseTimestamp(match[1]);
}

function parseTimestamp(value) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function extractArtifactMetadata(filePath) {
  const content = readFileSync(filePath, "utf8");
  return {
    evidenceRunId:
      /^Evidence run ID: (.+)$/m.exec(content)?.[1]?.trim() ??
      /^evidence_run_id=(.+)$/m.exec(content)?.[1]?.trim() ??
      null,
    databaseFingerprint:
      /^Database URL fingerprint: (.+)$/m.exec(content)?.[1]?.trim() ?? null,
    generatedAt:
      /^Generated UTC: (.+)$/m.exec(content)?.[1]?.trim() ??
      /^generated_at_utc=(.+)$/m.exec(content)?.[1]?.trim() ??
      null,
  };
}

function formatMetadataLines(metadata) {
  const lines = [];
  if (metadata?.evidenceRunId) {
    lines.push(`metadata_evidence_run_id=${metadata.evidenceRunId}`);
  }
  if (metadata?.databaseFingerprint) {
    lines.push(`metadata_database_fingerprint=${metadata.databaseFingerprint}`);
  }
  if (metadata?.generatedAt) {
    lines.push(`metadata_generated_utc=${metadata.generatedAt}`);
  }

  return lines;
}

function evaluateUatDocument(file) {
  if (!existsSync(file)) {
    return { pass: false, detail: `missing file: ${file}` };
  }

  const content = readFileSync(file, "utf8");
  const pending = countOccurrences(content, "Pending");
  const tbd = countOccurrences(content, "TBD");

  if (pending === 0 && tbd === 0) {
    return { pass: true, detail: file };
  }

  return { pass: false, detail: `Pending=${pending}, TBD=${tbd}` };
}

function missingMarkers(filePath, check) {
  const content = readFileSync(filePath, "utf8");
  const missing = [];
  for (const marker of check.requiredAll ?? []) {
    if (!content.includes(marker)) {
      missing.push(marker);
    }
  }
  if (
    check.requiredAny?.length &&
    !check.requiredAny.some((marker) => content.includes(marker))
  ) {
    missing.push(`one of: ${check.requiredAny.join(" OR ")}`);
  }

  return missing;
}

function countOccurrences(content, token) {
  let count = 0;
  let index = content.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = content.indexOf(token, index + token.length);
  }

  return count;
}
