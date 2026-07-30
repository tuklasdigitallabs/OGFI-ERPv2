import fs from "node:fs";
import path from "node:path";

export function extractApprovalRuleCatalogTransactionTypes(source) {
  const catalog = source.match(/export const approvalRuleCatalog\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!catalog) throw new Error("APPROVAL_RULE_CATALOG_NOT_FOUND");
  const types = [...catalog[1].matchAll(/transactionType:\s*"([^"]+)"/g)].map((match) => match[1]);
  if (types.length === 0 || new Set(types).size !== types.length) throw new Error("APPROVAL_RULE_CATALOG_INVALID");
  return types;
}

function sourceFiles(root) {
  const found = [];
  if (!fs.existsSync(root)) return found;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".next"].includes(entry.name)) continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(target));
    else if (/\.(?:cjs|js|mjs|ts|tsx)$/.test(entry.name)) found.push(target);
  }
  return found;
}

export function findForbiddenSyntheticManifestImports(repositoryRoot) {
  const importPattern = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()[^;\n]*(?:inventory-pilot\.synthetic\.local-only|inventory-pilot-synthetic-manifest)/;
  const roots = [
    path.join(repositoryRoot, "apps", "web", "src"),
    path.join(repositoryRoot, "packages", "database", "src"),
    path.join(repositoryRoot, "packages", "database", "prisma", "migrations"),
  ];
  return roots.flatMap(sourceFiles).filter((file) => importPattern.test(fs.readFileSync(file, "utf8"))).map((file) => path.relative(repositoryRoot, file).replaceAll(path.sep, "/")).sort();
}
