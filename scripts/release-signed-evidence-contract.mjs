import { existsSync, readFileSync } from "node:fs";

export const requiredSignedEvidenceFields = [
  "Evidence run ID",
  "Signed by",
  "Role",
  "Date",
  "Decision",
  "Owner",
];

export function evaluateSignedEvidenceDocument(document) {
  if (!existsSync(document.file)) {
    return { pass: false, status: "FAIL", detail: `missing file: ${document.file}` };
  }

  const content = readFileSync(document.file, "utf8");
  const counts = document.forbidden
    .map((token) => [token, countOccurrences(content, token)])
    .filter(([, count]) => count > 0);
  const missingFields = (document.requiredSignoffFields ?? requiredSignedEvidenceFields)
    .filter((field) => !hasNonPlaceholderField(content, field));
  const evidenceRunId = extractFieldValue(content, "Evidence run ID");
  const invalidFields = validateSignoffFields(content, missingFields);

  const failures = [];
  if (counts.length > 0) {
    failures.push(
      `unresolved markers: ${counts
        .map(([token, count]) => `${token}=${count}`)
        .join(", ")}`,
    );
  }

  if (missingFields.length > 0) {
    failures.push(`missing signoff fields: ${missingFields.join(", ")}`);
  }
  if (invalidFields.length > 0) {
    failures.push(`invalid signoff fields: ${invalidFields.join(", ")}`);
  }
  if (
    document.expectedEvidenceRunId &&
    evidenceRunId &&
    evidenceRunId !== document.expectedEvidenceRunId
  ) {
    failures.push(
      `evidence run ID mismatch: expected ${document.expectedEvidenceRunId}, found ${evidenceRunId}`,
    );
  }

  if (failures.length === 0) {
    return {
      pass: true,
      status: "PASS",
      detail: `${document.file}; signoff fields present`,
    };
  }

  return {
    pass: false,
    status: "FAIL",
    detail: `${document.file}; ${failures.join("; ")}`,
  };
}

function hasNonPlaceholderField(content, field) {
  return Boolean(extractFieldValue(content, field));
}

function validateSignoffFields(content, missingFields) {
  const invalid = [];
  if (!missingFields.includes("Date")) {
    const date = extractFieldValue(content, "Date");
    if (!/\b\d{4}-\d{2}-\d{2}\b/.test(date) && !/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(date)) {
      invalid.push("Date must include YYYY-MM-DD or MM/DD/YYYY");
    }
  }

  if (!missingFields.includes("Decision")) {
    const decision = extractFieldValue(content, "Decision");
    if (
      !/\b(approved|approve|accepted|accept|go|conditional go|hold|no-go|no go|rollback|defer|deferred)\b/i.test(
        decision,
      )
    ) {
      invalid.push("Decision must be an explicit release decision");
    }
  }

  return invalid;
}

function extractFieldValue(content, field) {
  const escapedField = escapeRegExp(field);
  const linePattern = new RegExp(
    `^\\s*(?:[-*]\\s*)?${escapedField}\\s*:\\s*(?!\\s*(?:Pending|TBD|\\[ \\])\\s*$)(\\S.*)$`,
    "im",
  );
  const tablePattern = new RegExp(
    `^\\s*\\|\\s*${escapedField}\\s*\\|\\s*(?!\\s*(?:Pending|TBD|\\[ \\]|-)\\s*\\|)(\\S[^|]*)\\|`,
    "im",
  );

  return linePattern.exec(content)?.[1]?.trim() ?? tablePattern.exec(content)?.[1]?.trim() ?? null;
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
