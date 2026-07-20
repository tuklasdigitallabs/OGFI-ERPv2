import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const postgresToolEnvNames = {
  psql: ["PSQL_BIN", "POSTGRES_PSQL_BIN"],
  pg_dump: ["PG_DUMP_BIN", "POSTGRES_PG_DUMP_BIN"],
  pg_restore: ["PG_RESTORE_BIN", "POSTGRES_PG_RESTORE_BIN"],
};

export function resolvePostgresTool(command) {
  for (const envName of postgresToolEnvNames[command] ?? []) {
    const candidate = process.env[envName];
    if (candidate) {
      return isExpectedTool(command, candidate) && canRun(candidate)
        ? candidate
        : null;
    }
  }

  return hasCommand(command) ? command : null;
}

export function isPostgresToolAvailable(command) {
  return Boolean(resolvePostgresTool(command));
}

export function requirePostgresTool(command, context) {
  const resolved = resolvePostgresTool(command);
  if (resolved) {
    return resolved;
  }

  const envHint = (postgresToolEnvNames[command] ?? [])
    .map((name) => `${name}=<full path to ${command}>`)
    .join(" or ");
  console.error(
    `${command} is required${context ? ` for ${context}` : ""}. Install PostgreSQL client tools, add ${command} to PATH, or set ${envHint}.`,
  );
  process.exit(1);
}

export function postgresClientConnectionUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    parsed.searchParams.delete("schema");
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

function isExpectedTool(command, candidate) {
  const normalized = candidate.replaceAll("\\", "/");
  const name = basename(normalized).toLowerCase();
  return (
    name === command || name === `${command}.exe` || name === `${command}.cmd`
  );
}

function canRun(command) {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasCommand(command) {
  try {
    const probe = process.platform === "win32" ? "where" : "sh";
    const args =
      process.platform === "win32"
        ? [command]
        : ["-c", `command -v ${command} >/dev/null 2>&1`];
    execFileSync(probe, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
