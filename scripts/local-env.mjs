import { existsSync, readFileSync } from "node:fs";

const localEnvFiles = [
  ".env.release.local",
  "apps/web/.env.local",
  "packages/database/.env",
];

export function loadLocalEnvValue(name, env = process.env) {
  if (env[name]) {
    return env[name];
  }

  for (const filePath of configuredLocalEnvFiles(env)) {
    const value = readEnvFileValue(filePath, name);
    if (value) {
      env[name] = value;
      return value;
    }
  }

  return "";
}

function configuredLocalEnvFiles(env) {
  const configured = env.LOCAL_ENV_FILES;
  if (!configured) {
    return localEnvFiles;
  }
  return configured
    .split(process.platform === "win32" ? ";" : ":")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readEnvFileValue(filePath, name) {
  if (!existsSync(filePath)) {
    return "";
  }

  const prefix = `${name}=`;
  const line = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(prefix));
  if (!line) {
    return "";
  }

  return stripQuotes(line.slice(prefix.length).trim());
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
