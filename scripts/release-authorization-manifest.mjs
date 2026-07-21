import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const protectedAppRoot = path.join(repositoryRoot, "apps/web/src/app/(app)");
const webSourceRoot = path.join(repositoryRoot, "apps/web/src");
const authorizationSurfaceBaselinePath = path.join(
  repositoryRoot,
  "scripts/authorization-surface-baseline.json",
);
const authorizationTestRegistryPath = path.join(
  repositoryRoot,
  "scripts/authorization-test-registry.json",
);
const delegatedServiceBaselinePath = path.join(
  repositoryRoot,
  "scripts/authorization-delegated-service-baseline.json",
);
const authorizationBoundaryClusterRoot = path.join(
  repositoryRoot,
  "scripts/authorization-boundary-clusters",
);
const authorizationEvidenceRoot = path.join(
  repositoryRoot,
  "release-evidence/authorization",
);

const workspacePolicies = {
  adjustments: ["inventory.stock_adjustment.view", ["TENANT", "COMPANY", "LOCATION"]],
  admin: ["core.administer", ["TENANT", "COMPANY"]],
  approvals: ["SERVICE_ENFORCED", ["TENANT", "COMPANY", "LOCATION", "DEPARTMENT"]],
  "branch-operations": ["restaurant.branch_operations.view", ["TENANT", "COMPANY", "BRAND", "LOCATION"]],
  counts: ["inventory.stock_count.view", ["TENANT", "COMPANY", "LOCATION"]],
  dashboard: ["authenticated", ["TENANT", "COMPANY", "BRAND", "LOCATION"]],
  evidence: ["SERVICE_ENFORCED", ["TENANT", "COMPANY", "BRAND", "LOCATION", "DEPARTMENT", "PROJECT", "MEMBERSHIP", "RESTRICTED_PROJECT"]],
  expansion: ["projects.project.view", ["TENANT", "COMPANY", "BRAND", "LOCATION"]],
  finance: ["finance.view", ["TENANT", "COMPANY", "BRAND", "LOCATION", "DEPARTMENT"]],
  "food-safety": ["restaurant.food_safety.view", ["TENANT", "COMPANY", "LOCATION"]],
  incidents: ["restaurant.incident.view", ["TENANT", "COMPANY", "LOCATION"]],
  inventory: ["inventory.balance.view", ["TENANT", "COMPANY", "LOCATION"]],
  items: ["SERVICE_ENFORCED", ["TENANT", "COMPANY"]],
  "knowledge-base": ["authenticated", ["TENANT", "COMPANY"]],
  maintenance: ["restaurant.maintenance.view", ["TENANT", "COMPANY", "LOCATION"]],
  marketing: ["authenticated", ["TENANT", "COMPANY", "BRAND", "LOCATION"]],
  "my-work": ["authenticated", ["TENANT", "COMPANY"]],
  notifications: ["authenticated", ["TENANT", "COMPANY"]],
  "project-templates": ["projects.template.view", ["TENANT", "COMPANY"]],
  projects: ["projects.project.view", ["TENANT", "COMPANY", "PROJECT", "MEMBERSHIP", "RESTRICTED_PROJECT"]],
  "purchase-orders": ["purchasing.purchase_order.view", ["TENANT", "COMPANY", "LOCATION", "DEPARTMENT"]],
  "purchase-requests": ["SERVICE_ENFORCED", ["TENANT", "COMPANY", "LOCATION", "DEPARTMENT"]],
  quotes: ["purchasing.quote.manage", ["TENANT", "COMPANY", "LOCATION", "DEPARTMENT"]],
  receiving: ["inventory.receiving.view", ["TENANT", "COMPANY", "LOCATION"]],
  recipes: ["restaurant.recipe.view", ["TENANT", "COMPANY", "BRAND", "LOCATION"]],
  reports: ["SERVICE_ENFORCED", ["TENANT", "COMPANY", "BRAND", "LOCATION", "DEPARTMENT"]],
  suppliers: ["SERVICE_ENFORCED", ["TENANT", "COMPANY"]],
  transfers: ["inventory.transfer.view", ["TENANT", "COMPANY", "LOCATION"]],
  wastage: ["inventory.wastage.view", ["TENANT", "COMPANY", "LOCATION"]],
  "work-boards": ["projects.project.view", ["TENANT", "COMPANY", "PROJECT", "MEMBERSHIP", "RESTRICTED_PROJECT"]],
  "work-calendar": ["projects.project.view", ["TENANT", "COMPANY", "PROJECT", "MEMBERSHIP", "RESTRICTED_PROJECT"]],
  workforce: ["workforce.view", ["TENANT", "COMPANY", "BRAND", "LOCATION", "DEPARTMENT"]],
};

const highRiskActionPattern =
  /^(activate|add|apply|approve|archive|assign|attest|begin|cancel|close|complete|create|deactivate|decide|delete|dispatch|end|execute|finalize|fulfill|grant|import|initiate|issue|link|lock|log|manage|mark|notify|post|publish|reassign|receive|record|reject|release|remove|reopen|request|resolve|retry|return|review|revoke|reverse|save|send|set|submit|transition|unlink|update|upload|upsert|verify|void|waive)/i;
const highRiskDisclosurePattern =
  /^(build.*export|download|export|list.*evidence|listProjectMemberOptions|listCoreAdminAuditEvents|getCoreAdmin(?:Overview|ApprovalRuleDetail|AuditEventDetail|CompanyDetail|LocationDetail|PermissionDetail|RoleDetail|UserDetail)|getReleaseSecurityEvidence)/i;
const standardServiceEntrypointNames = new Set(["verifyPassword"]);
const reviewedNonCallableServiceReexports = new Set([
  "server/services/expansionProjects.ts|./expansionProjectTypes|expansionProjectTypes|expansionProjectTypes",
]);

function isHighRiskSurfaceName(name) {
  return highRiskActionPattern.test(name) || highRiskDisclosurePattern.test(name);
}

function isHighRiskServiceEntrypoint(name, source) {
  if (standardServiceEntrypointNames.has(name)) return false;
  return (
    isHighRiskSurfaceName(name) ||
    /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(
      source,
    ) ||
    /\$transaction\s*\(/.test(source) ||
    /\b(?:writeFile|mkdir|rm|rename|copyFile|sendMail)\s*\(/.test(source)
  );
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

function relativeSurfacePath(absolutePath) {
  return path.relative(protectedAppRoot, absolutePath).replaceAll(path.sep, "/");
}

function policyFor(relativePath) {
  const workspace = relativePath.split("/")[0];
  const policy = workspacePolicies[workspace];
  if (!policy) {
    throw new Error(`AUTHORIZATION_SURFACE_UNCLASSIFIED:${relativePath}`);
  }
  return { permission: policy[0], dimensions: policy[1] };
}

function entry(input) {
  return {
    id: input.id,
    surfaceType: input.surfaceType,
    permission: input.permission,
    scopeDimensions: input.dimensions,
    guardChain: input.guardChain,
    denialContract: input.denialContract,
    riskTier: input.riskTier,
    executableTestIds: input.testIds,
    ...(input.delegatedServiceIds
      ? { delegatedServiceIds: input.delegatedServiceIds }
      : {}),
    ...(input.callChains ? { callChains: input.callChains } : {}),
    ...(input.permissionSource ? { permissionSource: input.permissionSource } : {}),
  };
}

function serviceModulePath(moduleSpecifier) {
  const prefix = "@/server/services/";
  if (!moduleSpecifier.startsWith(prefix)) {
    return null;
  }
  const modulePath = moduleSpecifier.slice(prefix.length);
  return `server/services/${modulePath.endsWith(".ts") ? modulePath : `${modulePath}.ts`}`;
}

function isDatabaseModule(moduleSpecifier) {
  return (
    moduleSpecifier === "@ogfi/database" ||
    /^@\/server\/(?:db|database)(?:\/|$)/.test(moduleSpecifier) ||
    /(?:^|\/)(?:prisma|database)(?:\/|$)/i.test(moduleSpecifier)
  );
}

function isValueImport(importDeclaration) {
  const clause = importDeclaration.importClause;
  if (!clause || clause.isTypeOnly) {
    return false;
  }
  if (clause.name) {
    return true;
  }
  const bindings = clause.namedBindings;
  if (!bindings) {
    return false;
  }
  if (ts.isNamespaceImport(bindings)) {
    return true;
  }
  return bindings.elements.some((element) => !element.isTypeOnly);
}

function functionNodeBody(node) {
  if (ts.isFunctionDeclaration(node)) {
    return node.body;
  }
  if (ts.isVariableDeclaration(node) && node.initializer) {
    const initializer = unwrapFunctionInitializer(node.initializer);
    if (
      initializer &&
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
    ) {
      return initializer.body;
    }
  }
  return null;
}

/**
 * Resolve each server action to the concrete service entrypoints it delegates to.
 * Local helpers are traversed recursively so presentation-layer indirection cannot
 * hide a missing authorization boundary.
 */
export function analyzeServerActionDelegations(
  source,
  filename = "surface.tsx",
  knownServiceIds = new Set(),
  knownServiceSymbols = knownServiceIds,
  targetFunctionNames = null,
) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const normalizedKnownIds =
    knownServiceIds instanceof Set ? knownServiceIds : new Set(knownServiceIds);
  const normalizedKnownSymbols =
    knownServiceSymbols instanceof Set
      ? knownServiceSymbols
      : new Set(knownServiceSymbols);
  const namedServiceImports = new Map();
  const namespaceServiceImports = new Map();
  const presentationImports = new Map();
  const localFunctions = new Map();
  const actions = [];

  function rejectDynamicProtectedImport(node) {
    if (!ts.isCallExpression(node) || node.arguments.length === 0) return;
    const specifier = node.arguments[0];
    if (!ts.isStringLiteral(specifier)) return;
    const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    const isRequire =
      ts.isIdentifier(node.expression) && node.expression.text === "require";
    if (
      (isDynamicImport || isRequire) &&
      (serviceModulePath(specifier.text) || isDatabaseModule(specifier.text))
    ) {
      throw new Error(
        `AUTHORIZATION_ACTION_DYNAMIC_PROTECTED_IMPORT:${filename}:${specifier.text}`,
      );
    }
  }
  function inspectSource(node) {
    rejectDynamicProtectedImport(node);
    ts.forEachChild(node, inspectSource);
  }
  inspectSource(sourceFile);

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const moduleSpecifier = statement.moduleSpecifier.text;
      if (isDatabaseModule(moduleSpecifier) && isValueImport(statement)) {
        throw new Error(`AUTHORIZATION_ACTION_DIRECT_DATABASE_ACCESS:${filename}:${moduleSpecifier}`);
      }
      const modulePath = serviceModulePath(moduleSpecifier);
      if (!modulePath || !statement.importClause) {
        continue;
      }
      const isPresentationModule = modulePath === "server/services/actionFeedback.ts";
      const bindings = statement.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        (isPresentationModule ? presentationImports : namespaceServiceImports).set(
          bindings.name.text,
          modulePath,
        );
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (element.isTypeOnly) {
            continue;
          }
          const importedName = (element.propertyName ?? element.name).text;
          const target = `${modulePath}#${importedName}`;
          (isPresentationModule ? presentationImports : namedServiceImports).set(
            element.name.text,
            target,
          );
        }
      }
    }

    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      localFunctions.set(statement.name.text, statement);
      if (!targetFunctionNames && hasUseServerDirective(statement.body)) {
        actions.push(statement.name.text);
      }
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }
        const body = functionNodeBody(declaration);
        if (!body) {
          continue;
        }
        localFunctions.set(declaration.name.text, declaration);
        if (!targetFunctionNames && ts.isBlock(body) && hasUseServerDirective(body)) {
          actions.push(declaration.name.text);
        }
      }
    }
  }

  if (targetFunctionNames) {
    for (const functionName of targetFunctionNames) {
      if (!localFunctions.has(functionName)) {
        throw new Error(
          `AUTHORIZATION_SURFACE_FUNCTION_UNDISCOVERED:${filename}#${functionName}`,
        );
      }
      actions.push(functionName);
    }
  }

  const results = new Map();
  for (const actionName of actions) {
    const delegatedServiceIds = new Set();
    const callChains = new Set();
    const presentationCallIds = new Set();
    const unresolved = new Set();

    function recordImportedCall(identifier, chain) {
      const target = namedServiceImports.get(identifier);
      if (target) {
        if (normalizedKnownIds.has(target)) {
          delegatedServiceIds.add(target);
          callChains.add([...chain, target].join(" -> "));
        } else if (!normalizedKnownSymbols.has(target)) {
          unresolved.add(target);
        }
        return true;
      }
      const presentationTarget = presentationImports.get(identifier);
      if (presentationTarget) {
        presentationCallIds.add(presentationTarget);
        return true;
      }
      return false;
    }

    function visitFunction(functionName, chain, activeFunctions) {
      if (activeFunctions.has(functionName)) {
        return;
      }
      const functionNode = localFunctions.get(functionName);
      const body = functionNode && functionNodeBody(functionNode);
      if (!body) {
        return;
      }
      const nextActive = new Set(activeFunctions).add(functionName);

      function visit(node) {
        if (
          ts.isIdentifier(node) &&
          namedServiceImports.has(node.text) &&
          normalizedKnownIds.has(namedServiceImports.get(node.text)) &&
          !ts.isTypeNode(node.parent) &&
          !(ts.isCallExpression(node.parent) && node.parent.expression === node)
        ) {
          throw new Error(
            `AUTHORIZATION_SERVER_ACTION_UNSUPPORTED_SERVICE_REFERENCE:${filename}#${actionName}:${node.text}`,
          );
        }
        if (ts.isCallExpression(node)) {
          const expression = node.expression;
          if (ts.isIdentifier(expression)) {
            if (!recordImportedCall(expression.text, chain)) {
              if (localFunctions.has(expression.text)) {
                visitFunction(expression.text, [...chain, expression.text], nextActive);
              }
            }
          } else if (
            ts.isPropertyAccessExpression(expression) &&
            ts.isIdentifier(expression.expression)
          ) {
            const namespaceName = expression.expression.text;
            const exportedName = expression.name.text;
            const modulePath = namespaceServiceImports.get(namespaceName);
            if (modulePath) {
              const target = `${modulePath}#${exportedName}`;
              if (normalizedKnownIds.has(target)) {
                delegatedServiceIds.add(target);
                callChains.add([...chain, target].join(" -> "));
              } else if (!normalizedKnownSymbols.has(target)) {
                unresolved.add(target);
              }
            }
            const presentationModulePath = presentationImports.get(namespaceName);
            if (presentationModulePath) {
              presentationCallIds.add(`${presentationModulePath}#${exportedName}`);
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(body);
    }

    visitFunction(actionName, [actionName], new Set());
    if (unresolved.size > 0) {
      throw new Error(
        `AUTHORIZATION_SERVER_ACTION_UNRESOLVED_SERVICE_DELEGATION:${filename}#${actionName}:${[...unresolved].sort().join(",")}`,
      );
    }
    if (delegatedServiceIds.size === 0) {
      throw new Error(
        `AUTHORIZATION_SERVER_ACTION_NO_SERVICE_DELEGATION:${filename}#${actionName}`,
      );
    }
    results.set(actionName, {
      delegatedServiceIds: [...delegatedServiceIds].sort(),
      callChains: [...callChains].sort(),
      presentationCallIds: [...presentationCallIds].sort(),
    });
  }
  return results;
}

function hasUseServerDirective(body) {
  const firstStatement = body?.statements?.[0];
  return Boolean(
    firstStatement &&
      ts.isExpressionStatement(firstStatement) &&
      ts.isStringLiteral(firstStatement.expression) &&
      firstStatement.expression.text === "use server",
  );
}

export function discoverServerActionNames(source, filename = "surface.tsx") {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const names = [];
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      hasUseServerDirective(node.body)
    ) {
      names.push(node.name.text);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const initializer = node.initializer;
      if (
        initializer &&
        (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
        ts.isBlock(initializer.body) &&
        hasUseServerDirective(initializer.body)
      ) {
        names.push(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function hasModifier(node, modifierKind) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === modifierKind));
}

function unwrapFunctionInitializer(initializer) {
  let current = initializer;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function discoverLocalFunctionDeclarations(sourceFile) {
  const functions = new Map();
  const declaredNames = new Set();
  const importedNames = new Set();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.name) {
        declaredNames.add(clause.name.text);
        importedNames.add(clause.name.text);
      }
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        declaredNames.add(bindings.name.text);
        importedNames.add(bindings.name.text);
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          declaredNames.add(element.name.text);
          importedNames.add(element.name.text);
        }
      }
      continue;
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declaredNames.add(statement.name.text);
      if (statement.body) {
        functions.set(statement.name.text, {
          body: statement.body,
          async: hasModifier(statement, ts.SyntaxKind.AsyncKeyword),
        });
      }
      continue;
    }
    if (
      (ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      declaredNames.add(statement.name.text);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      declaredNames.add(declaration.name.text);
      if (!declaration.initializer) continue;
      const initializer = unwrapFunctionInitializer(declaration.initializer);
      if (
        initializer &&
        (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
      ) {
        functions.set(declaration.name.text, {
          body: initializer.body,
          async: hasModifier(initializer, ts.SyntaxKind.AsyncKeyword),
        });
      }
    }
  }

  return { functions, declaredNames, importedNames };
}

function discoverExportedLocalFunctionBindings(sourceFile, filename) {
  const { functions, declaredNames, importedNames } =
    discoverLocalFunctionDeclarations(sourceFile);
  const bindings = new Map();

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportAssignment(statement) ||
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ) {
      throw new Error(
        `AUTHORIZATION_SERVICE_DEFAULT_EXPORT_UNRESOLVED:${filename}#default`,
      );
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      bindings.set(statement.name.text, statement.name.text);
      continue;
    }
    if (
      ts.isVariableStatement(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && functions.has(declaration.name.text)) {
          bindings.set(declaration.name.text, declaration.name.text);
        }
      }
      continue;
    }
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) {
      continue;
    }
    if (statement.moduleSpecifier) {
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !statement.exportClause ||
        !ts.isNamedExports(statement.exportClause)
      ) {
        throw new Error(
          `AUTHORIZATION_SERVICE_REEXPORT_UNRESOLVED:${filename}#*`,
        );
      }
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        const sourceName = element.propertyName?.text ?? element.name.text;
        const exportedName = element.name.text;
        const reviewKey = [
          filename,
          statement.moduleSpecifier.text,
          sourceName,
          exportedName,
        ].join("|");
        if (!reviewedNonCallableServiceReexports.has(reviewKey)) {
          throw new Error(
            `AUTHORIZATION_SERVICE_REEXPORT_UNRESOLVED:${filename}#${exportedName}`,
          );
        }
      }
      continue;
    }
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      throw new Error(`AUTHORIZATION_SERVICE_EXPORT_UNRESOLVED:${filename}#*`);
    }
    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly) continue;
      const localName = element.propertyName?.text ?? element.name.text;
      const exportedName = element.name.text;
      if (functions.has(localName)) {
        bindings.set(exportedName, localName);
      } else if (importedNames.has(localName) || !declaredNames.has(localName)) {
        throw new Error(
          `AUTHORIZATION_SERVICE_EXPORT_UNRESOLVED:${filename}#${exportedName}`,
        );
      }
    }
  }

  return { functions, bindings };
}

export function discoverExportedAsyncServiceEntrypoints(
  source,
  filename = "service.ts",
) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const { functions, bindings } = discoverExportedLocalFunctionBindings(
    sourceFile,
    filename,
  );
  return Array.from(bindings, ([exportedName, localName]) => ({
    exportedName,
    localName,
    declaration: functions.get(localName),
  }))
    .filter(({ declaration }) => declaration?.async)
    .map(({ exportedName, localName, declaration }) => ({
      name: exportedName,
      localName,
      source: declaration.body.getText(sourceFile),
    }));
}

function discoverLocalFunctionAuthorizationAnalysis(source, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const localFunctions = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      localFunctions.set(statement.name.text, statement.body);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const initializer = unwrapFunctionInitializer(declaration.initializer);
      if (
        initializer &&
        (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
      ) {
        localFunctions.set(declaration.name.text, initializer.body);
      }
    }
  }

  const calleesByFunction = new Map();
  const highRisk = new Set();
  const liveGuard = new Set();
  const permissionNamesByFunction = new Map();
  for (const [name, body] of localFunctions) {
    const functionSource = body.getText(sourceFile);
    if (isHighRiskServiceEntrypoint(name, functionSource)) highRisk.add(name);
    if (/\b(?:requirePermission|getGrantedPermissionCodes)\s*\(/.test(functionSource)) {
      liveGuard.add(name);
    }
    permissionNamesByFunction.set(
      name,
      new Set(
        Array.from(
          functionSource.matchAll(/permissions\.([A-Za-z0-9_]+)/g),
          (match) => match[1],
        ),
      ),
    );
    const callees = new Set();
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (localFunctions.has(node.expression.text)) callees.add(node.expression.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(body);
    calleesByFunction.set(name, callees);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, callees] of calleesByFunction) {
      if (!highRisk.has(name) && [...callees].some((callee) => highRisk.has(callee))) {
        highRisk.add(name);
        changed = true;
      }
      if (!liveGuard.has(name) && [...callees].some((callee) => liveGuard.has(callee))) {
        liveGuard.add(name);
        changed = true;
      }
      const permissionNames = permissionNamesByFunction.get(name);
      const beforeSize = permissionNames.size;
      for (const callee of callees) {
        for (const permissionName of permissionNamesByFunction.get(callee) ?? []) {
          permissionNames.add(permissionName);
        }
      }
      if (permissionNames.size !== beforeSize) changed = true;
    }
  }
  return { highRisk, liveGuard, permissionNamesByFunction };
}

export function analyzeExportedServiceEntrypoints(
  source,
  filename = "service.ts",
) {
  const localAuthorization = discoverLocalFunctionAuthorizationAnalysis(
    source,
    filename,
  );
  return discoverExportedAsyncServiceEntrypoints(source, filename).map(
    (entrypoint) => ({
      ...entrypoint,
      highRisk: localAuthorization.highRisk.has(entrypoint.localName),
      liveGuard: localAuthorization.liveGuard.has(entrypoint.localName),
      permissionNames: [
        ...(localAuthorization.permissionNamesByFunction.get(
          entrypoint.localName,
        ) ?? []),
      ],
    }),
  );
}

export function assertNoExportedSynchronousServiceWrites(source, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const writePattern =
    /\b(?:prisma|tx|client)\.[A-Za-z0-9_]+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$transaction\s*\(|\b(?:writeFile|mkdir|rm|rename|copyFile|sendMail)\s*\(/;
  const { functions: localFunctions, bindings } =
    discoverExportedLocalFunctionBindings(sourceFile, filename);

  const calleesByFunction = new Map();
  const writes = new Set();
  for (const [name, declaration] of localFunctions) {
    const { body } = declaration;
    if (writePattern.test(body.getText(sourceFile))) writes.add(name);
    const callees = new Set();
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        localFunctions.has(node.expression.text)
      ) {
        callees.add(node.expression.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(body);
    calleesByFunction.set(name, callees);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, callees] of calleesByFunction) {
      if (!writes.has(name) && [...callees].some((callee) => writes.has(callee))) {
        writes.add(name);
        changed = true;
      }
    }
  }

  for (const [exportedName, localName] of bindings) {
    const declaration = localFunctions.get(localName);
    if (declaration && !declaration.async && writes.has(localName)) {
      throw new Error(
        `AUTHORIZATION_SYNC_SERVICE_WRITE_UNDISCOVERED:${filename}#${exportedName}`,
      );
    }
  }
}

function discoverExportedServiceSymbols(source, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      !statement.isTypeOnly &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly) names.push(element.name.text);
      }
      continue;
    }
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      continue;
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      names.push(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.push(declaration.name.text);
        }
      }
    }
  }
  return names;
}

function discoverExecutableTestNames(source, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const active = new Set();
  const inactive = new Set();

  function testCallMode(expression) {
    if (ts.isIdentifier(expression) && ["it", "test"].includes(expression.text)) {
      return "active";
    }
    if (ts.isPropertyAccessExpression(expression)) {
      const base = expression.expression;
      if (ts.isIdentifier(base) && ["it", "test"].includes(base.text)) {
        if (["only", "concurrent"].includes(expression.name.text)) return "active";
        if (["skip", "todo"].includes(expression.name.text)) return "inactive";
      }
    }
    if (
      ts.isCallExpression(expression) &&
      ts.isPropertyAccessExpression(expression.expression) &&
      ts.isIdentifier(expression.expression.expression) &&
      ["it", "test"].includes(expression.expression.expression.text) &&
      expression.expression.name.text === "each"
    ) {
      return "active";
    }
    return null;
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const mode = testCallMode(node.expression);
      const title = node.arguments[0];
      if (
        mode &&
        title &&
        (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))
      ) {
        (mode === "active" ? active : inactive).add(title.text);
      }
      if (
        mode === "active" &&
        title &&
        (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title)) &&
        title.text.includes("$id") &&
        ts.isCallExpression(node.expression) &&
        node.expression.arguments[0] &&
        ts.isArrayLiteralExpression(node.expression.arguments[0])
      ) {
        for (const element of node.expression.arguments[0].elements) {
          if (!ts.isObjectLiteralExpression(element)) continue;
          const idProperty = element.properties.find(
            (property) =>
              ts.isPropertyAssignment(property) &&
              ((ts.isIdentifier(property.name) && property.name.text === "id") ||
                (ts.isStringLiteral(property.name) && property.name.text === "id")),
          );
          if (
            idProperty &&
            ts.isPropertyAssignment(idProperty) &&
            (ts.isStringLiteral(idProperty.initializer) ||
              ts.isNoSubstitutionTemplateLiteral(idProperty.initializer))
          ) {
            active.add(title.text.replaceAll("$id", idProperty.initializer.text));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { active, inactive };
}

export function buildAuthorizationSurfaceManifest() {
  const entries = [];
  const serviceFiles = walk(path.join(webSourceRoot, "server/services")).filter(
    (file) =>
      [".ts", ".tsx"].includes(path.extname(file)) &&
      !file.endsWith(".test.ts") &&
      !file.endsWith(".test.tsx"),
  );
  const knownServiceIds = new Set(
    serviceFiles.flatMap((file) => {
      const relativePath = path.relative(webSourceRoot, file).replaceAll(path.sep, "/");
      assertNoExportedSynchronousServiceWrites(
        readFileSync(file, "utf8"),
        relativePath,
      );
      return discoverExportedAsyncServiceEntrypoints(
        readFileSync(file, "utf8"),
        relativePath,
      ).map((serviceEntrypoint) => `${relativePath}#${serviceEntrypoint.name}`);
    }),
  );
  const knownServiceSymbols = new Set(
    serviceFiles.flatMap((file) => {
      const relativePath = path.relative(webSourceRoot, file).replaceAll(path.sep, "/");
      return discoverExportedServiceSymbols(
        readFileSync(file, "utf8"),
        relativePath,
      ).map((symbol) => `${relativePath}#${symbol}`);
    }),
  );
  const files = walk(protectedAppRoot).filter(
    (file) => ["page.tsx", "route.ts"].includes(path.basename(file)),
  );

  for (const file of files) {
    const relativePath = relativeSurfacePath(file);
    const source = readFileSync(file, "utf8");
    const policy = policyFor(relativePath);

    if (path.basename(file) === "page.tsx") {
      entries.push(
        entry({
          id: `${relativePath}#page`,
          surfaceType: "PAGE",
          ...policy,
          guardChain: ["authenticated-app-layout", "server-service-query"],
          denialContract: "SIGN_IN_OR_NON_DISCLOSING_PAGE",
          riskTier: "STANDARD",
          testIds: ["AUTHZ-DEEPLINK-001"],
        }),
      );

      const actionNames = discoverServerActionNames(source, relativePath);
      const actionDelegations = analyzeServerActionDelegations(
        source,
        relativePath,
        knownServiceIds,
        knownServiceSymbols,
      );
      for (const actionName of actionNames) {
        const riskTier = isHighRiskSurfaceName(actionName) ? "HIGH" : "STANDARD";
        const delegation = actionDelegations.get(actionName);
        entries.push(
          entry({
            id: `${relativePath}#${actionName}`,
            surfaceType: "SERVER_ACTION",
            permission: "SERVICE_ENFORCED",
            dimensions: policy.dimensions,
            guardChain: ["authenticated-app-layout", "domain-service", "service-authorization"],
            denialContract: "SAFE_ACTION_ERROR_NO_MUTATION",
            riskTier,
            testIds: [riskTier === "HIGH" ? "AUTHZ-ACTION-001" : "AUTHZ-SERVICE-001"],
            delegatedServiceIds: delegation.delegatedServiceIds,
            callChains: delegation.callChains,
          }),
        );
      }

      if (source.includes("use server") && actionNames.length === 0) {
        throw new Error(`AUTHORIZATION_SERVER_ACTION_UNDISCOVERED:${relativePath}`);
      }
      continue;
    }

    const methods = discoverExportedAsyncServiceEntrypoints(source, relativePath)
      .map((handler) => handler.name)
      .filter((name) => ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(name));
    if (methods.length === 0) {
      throw new Error(`AUTHORIZATION_ROUTE_METHOD_UNDISCOVERED:${relativePath}`);
    }
    const routeDelegations = analyzeServerActionDelegations(
      source,
      relativePath,
      knownServiceIds,
      knownServiceSymbols,
      methods,
    );
    for (const method of methods) {
      const isEvidence = relativePath.startsWith("evidence/");
      const delegation = routeDelegations.get(method);
      entries.push(
        entry({
          id: `${relativePath}#${method}`,
          surfaceType: isEvidence ? "EVIDENCE_DOWNLOAD" : "ROUTE_HANDLER",
          ...policy,
          guardChain: isEvidence
            ? ["session", "live-permission", "source-record-scope", "private-storage"]
            : ["session", "route-authorization", "scoped-service-builder"],
          denialContract: isEvidence
            ? "NON_ENUMERATING_404_NO_BYTES"
            : "401_AUTH_REQUIRED_OR_403_PERMISSION_DENIED",
          riskTier: "HIGH",
          testIds: [
            isEvidence ? "AUTHZ-EVIDENCE-001" : "AUTHZ-ROUTE-MATRIX-001",
          ],
          delegatedServiceIds: delegation.delegatedServiceIds,
          callChains: delegation.callChains,
        }),
      );
    }
  }

  const additionalActionFiles = walk(webSourceRoot).filter(
    (file) =>
      [".ts", ".tsx"].includes(path.extname(file)) &&
      !file.startsWith(`${protectedAppRoot}${path.sep}`) &&
      readFileSync(file, "utf8").includes("use server"),
  );
  for (const file of additionalActionFiles) {
    const relativePath = path.relative(webSourceRoot, file).replaceAll(path.sep, "/");
    const source = readFileSync(file, "utf8");
    let permission;
    let dimensions;
    if (relativePath === "components/AppShell.tsx") {
      permission = "authenticated";
      dimensions = ["TENANT", "COMPANY", "LOCATION"];
    } else if (relativePath === "components/FinanceSubworkspace.tsx") {
      permission = "SERVICE_ENFORCED";
      dimensions = ["TENANT", "COMPANY", "BRAND", "LOCATION", "DEPARTMENT"];
    } else if (relativePath.includes("/sign-in/")) {
      permission = "authentication.sign_in";
      dimensions = ["TENANT"];
    } else if (relativePath.includes("/activate/")) {
      permission = "authentication.activate";
      dimensions = ["TENANT"];
    } else if (relativePath.includes("/mfa-challenge/")) {
      permission = "authentication.mfa_challenge";
      dimensions = ["TENANT"];
    } else if (relativePath.includes("/account/security/")) {
      permission = "authentication.account_security";
      dimensions = ["TENANT", "COMPANY"];
    } else {
      throw new Error(`AUTHORIZATION_SURFACE_UNCLASSIFIED:${relativePath}`);
    }

    const actionNames = discoverServerActionNames(source, relativePath);
    const actionDelegations = analyzeServerActionDelegations(
      source,
      relativePath,
      knownServiceIds,
      knownServiceSymbols,
    );
    for (const actionName of actionNames) {
      const riskTier = isHighRiskSurfaceName(actionName) ? "HIGH" : "STANDARD";
      const delegation = actionDelegations.get(actionName);
      entries.push(
        entry({
          id: `${relativePath}#${actionName}`,
          surfaceType: "SERVER_ACTION",
          permission: permission.startsWith("authentication.")
            ? permission
            : "SERVICE_ENFORCED",
          dimensions,
          guardChain: ["server-action", "domain-service", "service-authorization"],
          denialContract: "SAFE_ACTION_ERROR_NO_MUTATION",
          riskTier,
          testIds: [riskTier === "HIGH" ? "AUTHZ-ACTION-001" : "AUTHZ-SERVICE-001"],
          delegatedServiceIds: delegation.delegatedServiceIds,
          callChains: delegation.callChains,
        }),
      );
    }
    if (actionNames.length === 0) {
      throw new Error(`AUTHORIZATION_SERVER_ACTION_UNDISCOVERED:${relativePath}`);
    }
  }

  const allRouteFiles = walk(path.join(webSourceRoot, "app")).filter(
    (file) => path.basename(file) === "route.ts",
  );
  const publicRouteAllowlist = new Set([
    "app/api/health/route.ts",
    "app/api/readiness/route.ts",
    "app/health/route.ts",
    "app/readiness/route.ts",
  ]);
  const controlledEvidenceRoutes = new Map([
    [
      "app/api/evidence/uploads/route.ts",
      {
        permission: "SERVICE_ENFORCED",
        dimensions: ["TENANT", "COMPANY", "SOURCE_RECORD"],
        guardChain: [
          "trusted-mutation-origin",
          "session",
          "live-permission",
          "source-record-scope",
          "company-quota",
          "quarantine",
        ],
        denialContract: "SAFE_UPLOAD_ERROR_NO_SOURCE_MUTATION",
      },
    ],
    [
      "app/api/evidence/uploads/content/route.ts",
      {
        permission: "SERVICE_ENFORCED",
        dimensions: ["TENANT", "COMPANY", "SOURCE_RECORD"],
        guardChain: [
          "trusted-mutation-origin",
          "session",
          "live-permission",
          "source-record-scope",
          "one-time-intent-token",
          "exact-version-stream",
          "durable-quarantine",
        ],
        denialContract: "SAFE_UPLOAD_ERROR_NO_SOURCE_MUTATION",
      },
    ],
  ]);
  for (const routeFile of allRouteFiles) {
    if (routeFile.startsWith(`${protectedAppRoot}${path.sep}`)) continue;
    const relativePath = path
      .relative(webSourceRoot, routeFile)
      .replaceAll(path.sep, "/");
    if (publicRouteAllowlist.has(relativePath)) continue;
    const controlledEvidencePolicy = controlledEvidenceRoutes.get(relativePath);
    if (controlledEvidencePolicy) {
      const source = readFileSync(routeFile, "utf8");
      const routeDelegations = analyzeServerActionDelegations(
        source,
        relativePath,
        knownServiceIds,
        knownServiceSymbols,
        ["POST"],
      ).get("POST");
      entries.push(
        entry({
          id: `${relativePath}#POST`,
          surfaceType: "ROUTE_HANDLER",
          ...controlledEvidencePolicy,
          riskTier: "HIGH",
          testIds: ["AUTHZ-EVIDENCE-001"],
          delegatedServiceIds: routeDelegations.delegatedServiceIds,
          callChains: routeDelegations.callChains,
        }),
      );
      continue;
    }
    if (relativePath !== "app/(auth)/sign-out/route.ts") {
      throw new Error(`AUTHORIZATION_ROUTE_UNCLASSIFIED:${relativePath}`);
    }
    const source = readFileSync(routeFile, "utf8");
    const routeDelegations = analyzeServerActionDelegations(
      source,
      relativePath,
      knownServiceIds,
      knownServiceSymbols,
      ["POST"],
    ).get("POST");
    entries.push(
      entry({
        id: `${relativePath}#POST`,
        surfaceType: "ROUTE_HANDLER",
        permission: "authentication.sign_out",
        dimensions: ["TENANT", "COMPANY"],
        guardChain: ["trusted-mutation-origin", "session", "session-ownership"],
        denialContract: "403_ORIGIN_DENIED_OR_SESSION_SCOPED_SIGN_OUT",
        riskTier: "HIGH",
        testIds: ["AUTHZ-SIGNOUT-ROUTE-001"],
        delegatedServiceIds: routeDelegations.delegatedServiceIds,
        callChains: routeDelegations.callChains,
      }),
    );
  }

  const permissionCatalogSource = readFileSync(
    path.join(webSourceRoot, "server/services/authorization.ts"),
    "utf8",
  );
  const permissionCatalogMatches = Array.from(
    permissionCatalogSource.matchAll(
      /^\s{2}([A-Za-z0-9_]+):\s*(?:\n\s*)?"([^"]+)"/gm,
    ),
  );
  const permissionSymbols = new Set(
    permissionCatalogMatches.map((match) => match[1]),
  );
  const permissionCodes = new Set(
    permissionCatalogMatches.map((match) => match[2]),
  );
  for (const file of serviceFiles) {
    const source = readFileSync(file, "utf8");
    const relativePath = path.relative(webSourceRoot, file).replaceAll(path.sep, "/");
    const serviceEntrypoints = analyzeExportedServiceEntrypoints(
      source,
      relativePath,
    );
    for (const serviceEntrypoint of serviceEntrypoints) {
      const functionName = serviceEntrypoint.name;
      const functionSource = serviceEntrypoint.source;
      const permissionNames = Array.from(
        new Set(serviceEntrypoint.permissionNames),
      ).filter((permissionName) => permissionSymbols.has(permissionName));
      const projectScoped = /project/i.test(relativePath + functionName);
      const riskTier = serviceEntrypoint.highRisk
        ? "HIGH"
        : "STANDARD";
      entries.push(
        entry({
          id: `${relativePath}#${functionName}`,
          surfaceType: "SERVICE_ENTRYPOINT",
          permission:
            permissionNames.length > 0
              ? permissionNames.map((name) => `permissions.${name}`).join(" | ")
              : "DELEGATED_INTERNAL_GUARD",
          permissionSource:
            permissionNames.length > 0
              ? "EXPLICIT_CATALOG_REFERENCE"
              : "REVIEWED_DELEGATION",
          dimensions: projectScoped
            ? ["TENANT", "COMPANY", "PROJECT", "MEMBERSHIP", "RESTRICTED_PROJECT"]
            : ["TENANT", "COMPANY", "BRAND", "LOCATION", "DEPARTMENT"],
          guardChain: [
            functionSource.includes("requireSessionContext")
              ? "session"
              : "session-delegated-by-caller",
            serviceEntrypoint.liveGuard
              ? "live-permission"
              : "service-policy-helper",
            functionSource.includes("findAuthorizedProject")
              ? "project-authorization"
              : "tenant-company-scope-query",
          ],
          denialContract: "SERVICE_ERROR_NO_UNAUTHORIZED_DATA_OR_MUTATION",
          riskTier,
          testIds: [],
        }),
      );
    }
  }

  const duplicateIds = entries
    .map((item) => item.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    throw new Error(`AUTHORIZATION_MANIFEST_DUPLICATE:${duplicateIds.join(",")}`);
  }
  const discoveredServiceIds = new Set(
    entries
      .filter((surface) => surface.surfaceType === "SERVICE_ENTRYPOINT")
      .map((surface) => surface.id),
  );
  for (const surface of entries.filter(
    (candidate) => candidate.surfaceType === "SERVER_ACTION",
  )) {
    for (const delegatedServiceId of surface.delegatedServiceIds ?? []) {
      if (!discoveredServiceIds.has(delegatedServiceId)) {
        throw new Error(
          `AUTHORIZATION_SERVER_ACTION_SERVICE_NOT_IN_MANIFEST:${surface.id}:${delegatedServiceId}`,
        );
      }
    }
  }
  for (const surface of entries) {
    const isReviewedSpecialPermission =
      surface.permission === "authenticated" ||
      surface.permission === "SERVICE_ENFORCED" ||
      surface.permission === "DELEGATED_INTERNAL_GUARD" ||
      surface.permission.startsWith("authentication.") ||
      surface.permission.startsWith("permissions.");
    if (
      !isReviewedSpecialPermission &&
      !permissionCodes.has(surface.permission)
    ) {
      throw new Error(
        `AUTHORIZATION_PERMISSION_CODE_UNKNOWN:${surface.id}:${surface.permission}`,
      );
    }
  }
  const highRiskServiceIds = new Set(
    entries
      .filter(
        (surface) =>
          surface.surfaceType === "SERVICE_ENTRYPOINT" &&
          surface.riskTier === "HIGH",
      )
      .map((surface) => surface.id),
  );
  const riskAlignedEntries = entries.map((surface) => {
    if (
      !["SERVER_ACTION", "ROUTE_HANDLER", "EVIDENCE_DOWNLOAD"].includes(
        surface.surfaceType,
      ) ||
      !(surface.delegatedServiceIds ?? []).some((serviceId) =>
        highRiskServiceIds.has(serviceId),
      )
    ) {
      return surface;
    }
    return {
      ...surface,
      riskTier: "HIGH",
      executableTestIds:
        surface.surfaceType === "SERVER_ACTION"
          ? ["AUTHZ-ACTION-001"]
          : surface.executableTestIds,
    };
  });
  const boundaryByServiceId = new Map();
  if (existsSync(authorizationBoundaryClusterRoot)) {
    for (const filename of readdirSync(authorizationBoundaryClusterRoot)
      .filter((name) => name.endsWith(".json"))
      .sort()) {
      const registry = JSON.parse(
        readFileSync(path.join(authorizationBoundaryClusterRoot, filename), "utf8"),
      );
      for (const boundary of registry.boundaries ?? []) {
        boundaryByServiceId.set(boundary.surfaceId, boundary);
      }
    }
  }
  const enrichedEntries = riskAlignedEntries.map((surface) => {
    const serviceIds =
      surface.surfaceType === "SERVICE_ENTRYPOINT"
        ? [surface.id]
        : ["SERVER_ACTION", "ROUTE_HANDLER", "EVIDENCE_DOWNLOAD"].includes(
              surface.surfaceType,
            )
          ? (surface.delegatedServiceIds ?? [])
          : [];
    const bindings = serviceIds
      .map((serviceId) => boundaryByServiceId.get(serviceId))
      .filter(Boolean);
    if (bindings.length === 0) return surface;
    return {
      ...surface,
      ...(surface.surfaceType === "SERVICE_ENTRYPOINT"
        ? {
            executableTestIds: [
              ...new Set(
                bindings.flatMap((item) =>
                  (item.caseIds ?? []).map((caseId) =>
                    `BOUNDARY_CASE:${caseId}`,
                  ),
                ),
              ),
            ],
          }
        : {}),
      boundaryClassifications: [...new Set(bindings.map((item) => item.classification))],
      authorizationAdapterIds: [
        ...new Set(bindings.flatMap((item) => item.adapterIds ?? [])),
      ],
      boundaryCaseIds: [...new Set(bindings.flatMap((item) => item.caseIds ?? []))],
      noMutationControls: [
        ...new Set(bindings.flatMap((item) => item.noMutationControls ?? [])),
      ],
    };
  });
  return enrichedEntries.sort((left, right) => left.id.localeCompare(right.id));
}

export function assertAuthorizationSurfaceBaseline(manifest) {
  const declaredSurfaces = JSON.parse(
    readFileSync(authorizationSurfaceBaselinePath, "utf8"),
  );
  if (
    !Array.isArray(declaredSurfaces) ||
    declaredSurfaces.some(
      (surface) =>
        !surface || typeof surface !== "object" || typeof surface.id !== "string",
    )
  ) {
    throw new Error("AUTHORIZATION_SURFACE_BASELINE_FORMAT_INVALID");
  }
  const discoveredIds = manifest.map((surface) => surface.id);
  const declaredIds = declaredSurfaces.map((surface) => surface.id);
  const declared = new Set(declaredIds);
  const discovered = new Set(discoveredIds);
  const undeclared = discoveredIds.filter((id) => !declared.has(id));
  const stale = declaredIds.filter((id) => !discovered.has(id));
  const discoveredById = new Map(manifest.map((surface) => [surface.id, surface]));
  const changed = declaredSurfaces
    .filter((surface) => discovered.has(surface.id))
    .filter(
      (surface) =>
        JSON.stringify(surface) !== JSON.stringify(discoveredById.get(surface.id)),
    )
    .map((surface) => surface.id);
  if (undeclared.length > 0 || stale.length > 0 || changed.length > 0) {
    throw new Error(
      `AUTHORIZATION_SURFACE_BASELINE_DRIFT:${JSON.stringify({ undeclared, stale, changed })}`,
    );
  }
  const testRegistry = JSON.parse(
    readFileSync(authorizationTestRegistryPath, "utf8"),
  );
  const boundaryCaseIds = new Set(
    existsSync(authorizationBoundaryClusterRoot)
      ? readdirSync(authorizationBoundaryClusterRoot)
          .filter((filename) => filename.endsWith(".json"))
          .flatMap((filename) => {
            const registry = JSON.parse(
              readFileSync(
                path.join(authorizationBoundaryClusterRoot, filename),
                "utf8",
              ),
            );
            return (registry.cases ?? []).map((testCase) => testCase.id);
          })
      : [],
  );
  const reviewedDelegations = JSON.parse(
    readFileSync(delegatedServiceBaselinePath, "utf8"),
  );
  const discoveredDelegations = manifest
    .filter(
      (surface) =>
        surface.surfaceType === "SERVICE_ENTRYPOINT" &&
        surface.riskTier === "HIGH" &&
        surface.permission === "DELEGATED_INTERNAL_GUARD",
    )
    .map((surface) => surface.id);
  if (
    JSON.stringify(reviewedDelegations) !== JSON.stringify(discoveredDelegations)
  ) {
    throw new Error("AUTHORIZATION_DELEGATED_SERVICE_REVIEW_REQUIRED");
  }
  for (const surface of manifest) {
    for (const testId of surface.executableTestIds) {
      if (testId.startsWith("BOUNDARY_CASE:")) {
        const caseId = testId.slice("BOUNDARY_CASE:".length);
        if (!boundaryCaseIds.has(caseId)) {
          throw new Error(
            `AUTHORIZATION_TEST_BINDING_MISSING:${surface.id}:${testId}`,
          );
        }
        continue;
      }
      const binding = testRegistry[testId];
      if (!binding || !existsSync(path.join(repositoryRoot, binding.file))) {
        throw new Error(`AUTHORIZATION_TEST_BINDING_MISSING:${surface.id}:${testId}`);
      }
      if (
        binding.additionalFile &&
        !existsSync(path.join(repositoryRoot, binding.additionalFile))
      ) {
        throw new Error(`AUTHORIZATION_TEST_BINDING_MISSING:${surface.id}:${testId}`);
      }
    }
  }
}

export function authorizationBoundaryCoverageReport(manifest) {
  const registryFiles = existsSync(authorizationBoundaryClusterRoot)
    ? readdirSync(authorizationBoundaryClusterRoot)
        .filter((filename) => filename.endsWith(".json"))
        .sort()
    : [];
  const registries = registryFiles.map((filename) => ({
    filename,
    value: JSON.parse(
      readFileSync(path.join(authorizationBoundaryClusterRoot, filename), "utf8"),
    ),
  }));
  const expectedIds = manifest
    .filter(
      (surface) =>
        surface.surfaceType === "SERVICE_ENTRYPOINT" &&
        surface.riskTier === "HIGH",
    )
    .map((surface) => surface.id);
  const expected = new Set(expectedIds);
  const cases = new Map();
  const executableTestsByFile = new Map();
  const duplicateCaseIds = [];
  const invalidCases = [];
  const boundaries = [];

  for (const registry of registries) {
    if (
      registry.value?.schemaVersion !== 1 ||
      !Array.isArray(registry.value.testFiles) ||
      !Array.isArray(registry.value.cases) ||
      !Array.isArray(registry.value.boundaries)
    ) {
      throw new Error(`AUTHORIZATION_BOUNDARY_REGISTRY_INVALID:${registry.filename}`);
    }
    const declaredTestFiles = new Set(registry.value.testFiles);
    const referencedTestFiles = new Set(
      registry.value.cases.map((testCase) => testCase.file),
    );
    if (
      declaredTestFiles.size !== registry.value.testFiles.length ||
      declaredTestFiles.size !== referencedTestFiles.size ||
      [...declaredTestFiles].some(
        (testFile) =>
          !referencedTestFiles.has(testFile) ||
          !existsSync(path.join(repositoryRoot, testFile)),
      )
    ) {
      invalidCases.push(`${registry.filename}:TEST_FILE_REGISTRY_MISMATCH`);
    }
    for (const testCase of registry.value.cases) {
      if (cases.has(testCase.id)) duplicateCaseIds.push(testCase.id);
      cases.set(testCase.id, testCase);
      const absoluteTestPath = path.join(repositoryRoot, testCase.file ?? "");
      const testName = String(testCase.testName ?? "");
      const testNamePrefix = testName.split("*")[0];
      if (existsSync(absoluteTestPath) && !executableTestsByFile.has(testCase.file)) {
        executableTestsByFile.set(
          testCase.file,
          discoverExecutableTestNames(
            readFileSync(absoluteTestPath, "utf8"),
            testCase.file,
          ),
        );
      }
      const discoveredTests = executableTestsByFile.get(testCase.file);
      const matches = (candidate) =>
        testName.includes("*")
          ? candidate.startsWith(testNamePrefix)
          : candidate === testName;
      const activeMatch = discoveredTests
        ? [...discoveredTests.active].some(matches)
        : false;
      const inactiveMatch = discoveredTests
        ? [...discoveredTests.inactive].some(matches)
        : false;
      if (
        !testCase.id ||
        !testCase.file ||
        !testNamePrefix ||
        !existsSync(absoluteTestPath) ||
        !Array.isArray(testCase.coveredControls) ||
        testCase.coveredControls.length === 0 ||
        !/(DATABASE|POSTGRESQL)/i.test(String(testCase.kind ?? "")) ||
        !activeMatch ||
        inactiveMatch
      ) {
        invalidCases.push(`${registry.filename}:${testCase.id ?? "UNKNOWN"}`);
      }
    }
    for (const boundary of registry.value.boundaries) {
      boundaries.push({ ...boundary, registry: registry.filename });
    }
  }

  const boundaryCounts = new Map();
  for (const boundary of boundaries) {
    boundaryCounts.set(
      boundary.surfaceId,
      (boundaryCounts.get(boundary.surfaceId) ?? 0) + 1,
    );
  }
  const duplicateBoundaryIds = Array.from(boundaryCounts)
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  const discoveredBoundaryIds = new Set(boundaries.map((boundary) => boundary.surfaceId));
  const missingBoundaryIds = expectedIds.filter(
    (id) => !discoveredBoundaryIds.has(id),
  );
  const staleBoundaryIds = Array.from(discoveredBoundaryIds).filter(
    (id) => !expected.has(id),
  );
  const invalidBoundaryBindings = boundaries
    .filter(
      (boundary) =>
        !["PUBLIC_BOUNDARY", "INTERNAL_CALLER_PRECONDITION"].includes(
          boundary.classification,
        ) ||
        !Array.isArray(boundary.adapterIds) ||
        boundary.adapterIds.length === 0 ||
        !Array.isArray(boundary.caseIds) ||
        !Array.isArray(boundary.noMutationControls) ||
        boundary.noMutationControls.length === 0 ||
        !["COVERED", "UNCOVERED"].includes(boundary.status) ||
        (boundary.status === "COVERED" &&
          (boundary.caseIds.length === 0 ||
            boundary.caseIds.some((caseId) => !cases.has(caseId))))
    )
    .map((boundary) => `${boundary.registry}:${boundary.surfaceId}`);
  const uncoveredBoundaryIds = boundaries
    .filter((boundary) => boundary.status !== "COVERED")
    .map((boundary) => boundary.surfaceId);
  const coveredBoundaryIds = new Set(
    boundaries
      .filter((boundary) => boundary.status === "COVERED")
      .map((boundary) => boundary.surfaceId),
  );
  const highRiskBoundaries = manifest.filter(
    (surface) =>
      surface.riskTier === "HIGH" &&
      ["SERVER_ACTION", "ROUTE_HANDLER", "EVIDENCE_DOWNLOAD"].includes(
        surface.surfaceType,
      ),
  );
  const unboundHighSurfaceIds = highRiskBoundaries
    .filter(
      (surface) =>
        !Array.isArray(surface.boundaryCaseIds) ||
        surface.boundaryCaseIds.length === 0,
    )
    .map((surface) => surface.id);
  const uncoveredHighDelegationIds = highRiskBoundaries.flatMap((surface) =>
    (surface.delegatedServiceIds ?? [])
      .filter(
        (serviceId) => expected.has(serviceId) && !coveredBoundaryIds.has(serviceId),
      )
      .map((serviceId) => `${surface.id}->${serviceId}`),
  );
  const invalidRouteMatrixSurfaceIds = highRiskBoundaries
    .filter((surface) =>
      ["ROUTE_HANDLER", "EVIDENCE_DOWNLOAD"].includes(surface.surfaceType),
    )
    .filter((surface) =>
      surface.id === "app/(auth)/sign-out/route.ts#POST"
        ? !surface.executableTestIds.includes("AUTHZ-SIGNOUT-ROUTE-001")
        : [
              "app/api/evidence/uploads/route.ts#POST",
              "app/api/evidence/uploads/content/route.ts#POST",
            ].includes(surface.id)
          ? !surface.executableTestIds.includes("AUTHZ-EVIDENCE-001")
        : surface.surfaceType === "EVIDENCE_DOWNLOAD"
        ? !surface.executableTestIds.includes("AUTHZ-EVIDENCE-001")
        : !surface.executableTestIds.includes("AUTHZ-ROUTE-MATRIX-001"),
    )
    .map((surface) => surface.id);

  return {
    registryFiles,
    expectedHighRiskServiceCount: expectedIds.length,
    registeredBoundaryCount: boundaries.length,
    coveredBoundaryCount: boundaries.filter(
      (boundary) => boundary.status === "COVERED",
    ).length,
    uncoveredBoundaryIds,
    missingBoundaryIds,
    staleBoundaryIds,
    duplicateBoundaryIds,
    duplicateCaseIds,
    invalidCases,
    invalidBoundaryBindings,
    unboundHighSurfaceIds,
    uncoveredHighDelegationIds,
    invalidRouteMatrixSurfaceIds,
  };
}

export function assertAuthorizationBoundaryCoverage(manifest) {
  const report = authorizationBoundaryCoverageReport(manifest);
  const failures = Object.entries(report).filter(
    ([key, value]) =>
      key.endsWith("Ids") || key.startsWith("invalid") || key.startsWith("duplicate")
        ? Array.isArray(value) && value.length > 0
        : false,
  );
  if (failures.length > 0) {
    throw new Error(
      `AUTHORIZATION_BOUNDARY_COVERAGE_INCOMPLETE:${JSON.stringify(
        Object.fromEntries(failures),
      )}`,
    );
  }
  return report;
}

function readReleaseTestAttestation(suite, gitHead, required) {
  if (!required) return null;
  const attestationPath = path.join(
    authorizationEvidenceRoot,
    `${suite}-test-attestation.json`,
  );
  if (!existsSync(attestationPath)) {
    throw new Error(`AUTHORIZATION_TEST_ATTESTATION_MISSING:${suite}`);
  }
  const raw = readFileSync(attestationPath, "utf8");
  const attestation = JSON.parse(raw);
  const expectedCommand =
    suite === "authorization"
      ? "pnpm run test:authorization:execute"
      : "pnpm run test:e2e:execute";
  if (
    attestation?.schemaVersion !== 1 ||
    attestation.suite !== suite ||
    attestation.command !== expectedCommand ||
    attestation.result !== "PASSED" ||
    attestation.exitCode !== 0 ||
    attestation.gitHead !== gitHead ||
    attestation.databaseIdentity !==
      (process.env.AUTHORIZATION_TEST_DATABASE ?? null) ||
    attestation.databaseRunId !==
      (process.env.AUTHORIZATION_TEST_RUN_ID ?? null) ||
    attestation.disposableDatabaseSentinel !==
      (process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes") ||
    (process.env.CI &&
      (attestation.githubSha !== gitHead ||
        attestation.exactGithubShaMatch !== true))
  ) {
    throw new Error(`AUTHORIZATION_TEST_ATTESTATION_INVALID:${suite}`);
  }
  return {
    ...attestation,
    checksum: `sha256:${createHash("sha256").update(raw).digest("hex")}`,
  };
}

export function authorizationManifestEvidence(
  { requireExecutionAttestations = true } = {},
) {
  const manifest = buildAuthorizationSurfaceManifest();
  assertAuthorizationSurfaceBaseline(manifest);
  const boundaryCoverage = assertAuthorizationBoundaryCoverage(manifest);
  let commitSha = "unknown";
  try {
    commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    // A source archive without .git remains valid for local inspection.
  }
  let workingTreeClean = null;
  try {
    workingTreeClean =
      execFileSync("git", ["status", "--porcelain"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).trim().length === 0;
  } catch {
    // Source archives have no working-tree state.
  }
  if (process.env.CI && !/^[a-f0-9]{40}$/.test(commitSha)) {
    throw new Error("AUTHORIZATION_EVIDENCE_EXACT_SHA_REQUIRED");
  }
  if (process.env.CI && process.env.GITHUB_SHA !== commitSha) {
    throw new Error("AUTHORIZATION_EVIDENCE_GITHUB_SHA_MISMATCH");
  }
  if (process.env.CI && workingTreeClean !== true) {
    throw new Error("AUTHORIZATION_EVIDENCE_CLEAN_WORKTREE_REQUIRED");
  }
  const manifestChecksum = `sha256:${createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex")}`;
  const baselineChecksum = `sha256:${createHash("sha256")
    .update(readFileSync(authorizationSurfaceBaselinePath))
    .digest("hex")}`;
  const testRegistryChecksum = `sha256:${createHash("sha256")
    .update(readFileSync(authorizationTestRegistryPath))
    .digest("hex")}`;
  const delegatedServiceBaselineChecksum = `sha256:${createHash("sha256")
    .update(readFileSync(delegatedServiceBaselinePath))
    .digest("hex")}`;
  const boundaryRegistryChecksums = Object.fromEntries(
    boundaryCoverage.registryFiles.map((filename) => [
      filename,
      `sha256:${createHash("sha256")
        .update(
          readFileSync(path.join(authorizationBoundaryClusterRoot, filename)),
        )
        .digest("hex")}`,
    ]),
  );
  const testAttestations = Object.fromEntries(
    ["authorization", "e2e"].map((suite) => [
      suite,
      readReleaseTestAttestation(
        suite,
        commitSha,
        requireExecutionAttestations,
      ),
    ]),
  );
  const githubRunUrl =
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commitSha,
    workingTreeClean,
    manifestChecksum,
    baselineChecksum,
    testRegistryChecksum,
    delegatedServiceBaselineChecksum,
    boundaryRegistryChecksums,
    boundaryCoverage,
    execution: {
      result: "PASSED",
      command:
        "pnpm test:authorization; pnpm test:e2e; pnpm release:authorization-manifest",
      databaseIdentity: process.env.AUTHORIZATION_TEST_DATABASE ?? null,
      databaseRunId: process.env.AUTHORIZATION_TEST_RUN_ID ?? null,
      disposableDatabaseSentinel:
        process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes",
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
      githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      githubRunUrl,
      artifactName: process.env.GITHUB_RUN_ID
        ? `ci-verification-${process.env.GITHUB_RUN_ID}-${commitSha}`
        : null,
      testAttestations,
    },
    totals: {
      surfaces: manifest.length,
      highRisk: manifest.filter((item) => item.riskTier === "HIGH").length,
      pages: manifest.filter((item) => item.surfaceType === "PAGE").length,
      serverActions: manifest.filter((item) => item.surfaceType === "SERVER_ACTION").length,
      routeHandlers: manifest.filter((item) => item.surfaceType.endsWith("ROUTE_HANDLER")).length,
      evidenceDownloads: manifest.filter((item) => item.surfaceType === "EVIDENCE_DOWNLOAD").length,
    },
    manifest,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--print-summary")) {
    const summary = buildAuthorizationSurfaceManifest().reduce(
      (result, surface) => {
        const current = result[surface.surfaceType] ?? { total: 0, highRisk: 0 };
        current.total += 1;
        current.highRisk += surface.riskTier === "HIGH" ? 1 : 0;
        result[surface.surfaceType] = current;
        return result;
      },
      {},
    );
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }
  if (process.argv.includes("--print-boundary-coverage")) {
    console.log(
      JSON.stringify(
        authorizationBoundaryCoverageReport(buildAuthorizationSurfaceManifest()),
        null,
        2,
      ),
    );
    process.exit(0);
  }
  if (process.argv.includes("--print-high-risk-services")) {
    console.log(
      JSON.stringify(
        buildAuthorizationSurfaceManifest()
          .filter(
            (surface) =>
              surface.surfaceType === "SERVICE_ENTRYPOINT" &&
              surface.riskTier === "HIGH",
          )
          .map((surface) => surface.id),
        null,
        2,
      ),
    );
    process.exit(0);
  }
  if (process.argv.includes("--write-delegated-baseline")) {
    writeFileSync(
      delegatedServiceBaselinePath,
      `${JSON.stringify(
        buildAuthorizationSurfaceManifest()
          .filter(
            (surface) =>
              surface.surfaceType === "SERVICE_ENTRYPOINT" &&
              surface.riskTier === "HIGH" &&
              surface.permission === "DELEGATED_INTERNAL_GUARD",
          )
          .map((surface) => surface.id),
        null,
        2,
      )}\n`,
    );
    process.exit(0);
  }
  if (process.argv.includes("--write-baseline")) {
    writeFileSync(
      authorizationSurfaceBaselinePath,
      `${JSON.stringify(buildAuthorizationSurfaceManifest(), null, 2)}\n`,
    );
    process.exit(0);
  }
  if (process.argv.includes("--print-ids")) {
    console.log(
      JSON.stringify(buildAuthorizationSurfaceManifest().map((surface) => surface.id)),
    );
    process.exit(0);
  }
  if (process.argv.includes("--print-delegated")) {
    console.log(
      JSON.stringify(
        buildAuthorizationSurfaceManifest()
          .filter(
            (surface) =>
              surface.surfaceType === "SERVICE_ENTRYPOINT" &&
              surface.riskTier === "HIGH" &&
              surface.permission === "DELEGATED_INTERNAL_GUARD",
          )
          .map((surface) => surface.id),
      ),
    );
    process.exit(0);
  }
  const evidence = authorizationManifestEvidence();
  if (process.argv.includes("--write-evidence")) {
    const outputDirectory = path.join(repositoryRoot, "release-evidence/authorization");
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(
      path.join(outputDirectory, "authorization-surface-manifest.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
  }
  console.log(
    `Authorization manifest: ${evidence.totals.surfaces} surfaces (${evidence.totals.highRisk} high risk) at ${evidence.commitSha}`,
  );
}
