import { randomBytes } from "node:crypto";

const commitSha = process.env.RELEASE_EXPECTED_COMMIT_SHA;
const artifactSha256 = process.env.RELEASE_EXPECTED_ARTIFACT_SHA256;
const fence = process.env.RELEASE_EXPECTED_PROXY_FENCE;
const configuredAddresses = process.env.RELEASE_PUBLIC_BASE_URLS ?? process.env.RELEASE_PUBLIC_BASE_URL;

if (!configuredAddresses || !/^[a-f0-9]{40}$/.test(commitSha ?? "") || !/^[a-f0-9]{64}$/.test(artifactSha256 ?? "") || !/^[A-Za-z0-9_-]{16,128}$/.test(fence ?? "")) {
  throw new Error("RELEASE_SERVED_IDENTITY_INPUT_INVALID");
}

let addresses;
try {
  addresses = JSON.parse(configuredAddresses);
} catch {
  addresses = configuredAddresses.split(",").map((value) => value.trim()).filter(Boolean);
}
if (!Array.isArray(addresses) || addresses.length === 0 || addresses.length > 32 || new Set(addresses).size !== addresses.length || addresses.some((value) => !/^https:\/\/[^/]+$/.test(value))) {
  throw new Error("RELEASE_PUBLIC_ADDRESS_INVENTORY_INVALID");
}

const probe = randomBytes(32).toString("base64url");
const results = [];
for (const baseUrl of addresses) {
  const url = new URL("/.well-known/ogfi-release", baseUrl);
  url.searchParams.set("probe", probe);
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (response.status !== 200 || response.headers.get("cache-control") !== "no-store, max-age=0" || response.headers.get("x-ogfi-proxy-fence") !== fence) {
    throw new Error(`RELEASE_SERVED_IDENTITY_RESPONSE_INVALID:${new URL(baseUrl).hostname}`);
  }
  const identity = await response.json();
  if (identity?.commitSha !== commitSha || identity?.artifactSha256 !== artifactSha256 || identity?.probe !== probe) {
    throw new Error(`RELEASE_SERVED_IDENTITY_MISMATCH:${new URL(baseUrl).hostname}`);
  }
  results.push({ address: baseUrl, candidate: commitSha, fence, probe, verifiedAtUtc: new Date().toISOString() });
}
console.log(JSON.stringify({ schemaVersion: 1, result: "PASS", addresses: results }));
