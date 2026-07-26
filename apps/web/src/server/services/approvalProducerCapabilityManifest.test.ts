import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import {
  activateNextApprovalDocumentTypes,
  approvalGraphDirectMutationOperations,
  approvalGraphModels,
  approvalGraphMutationInventory,
  approvalGraphNestedMutationOperations,
  approvalGraphMutationOperations,
  approvalRawSqlCallInventory,
  approvalRawSqlMethods,
  approvalGraphToolingDdlInventory,
  approvalGraphToolingMutationInventory,
  approvalGraphToolingProbeInventory,
  canonicalApprovalDocumentTypes,
  financeCloseApprovalDocumentTypes,
  prismaRawFragmentInventory,
  specializedApprovalDocumentTypes,
  type ApprovalGraphModel,
  type ApprovalGraphMutationOperation,
} from "./approvalGraphMutationInventory";
import {
  APPROVAL_PRODUCER_CAPABILITY_MANIFEST_DIGEST,
  APPROVAL_PRODUCER_CAPABILITY_VERSION,
  approvalProducerCapabilityContracts,
  approvalProducerCapabilityManifest,
  approvalProducerStableErrors,
} from "./approvalProducerCapabilityManifest";
import {
  approvalRoutingPolicies,
  supportedApprovalDocumentTypes,
} from "./approvalRoutingRegistry";

const repositoryRoot = path.resolve(__dirname, "../../../../..");
const sourceExtensions = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
]);
const excludedSegments = new Set([
  "node_modules", ".next", "dist", "build", "coverage", "generated",
]);
const modelSet = new Set<string>(approvalGraphModels);
const operationSet = new Set<string>(approvalGraphMutationOperations);
const directMutationSet = new Set<string>(approvalGraphDirectMutationOperations);
const nestedMutationSet = new Set<string>(approvalGraphNestedMutationOperations);
const knownDelegateOperations = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  ...approvalGraphDirectMutationOperations,
  "count", "aggregate", "groupBy",
]);
const rawMethodSet = new Set<string>(approvalRawSqlMethods);
const nestedCapableDirectOperations = new Set(["create", "update", "upsert"]);
const prismaSchema = readFileSync(
  path.join(repositoryRoot, "packages/database/prisma/schema.prisma"),
  "utf8",
);
const nestedCarrierModels = new Set(
  [...prismaSchema.matchAll(/\bmodel\s+(\w+)\s*\{([\s\S]*?)\n\}/g)]
    .filter((match) => /^\s+(?:approvalInstance|steps|targets)\s+/m.test(match[2]!))
    .map((match) => `${match[1]![0]!.toLowerCase()}${match[1]!.slice(1)}`),
);

type MutationFinding = {
  file: string;
  owner: string;
  model: ApprovalGraphModel;
  operation: ApprovalGraphMutationOperation;
  access: "DIRECT_DELEGATE" | "NESTED_RELATION";
};

type RawFinding = {
  file: string;
  owner: string;
  method: (typeof approvalRawSqlMethods)[number];
  ownerBodyDigest: string;
  dynamicArgument: boolean;
};

type SourceAnalysis = {
  findings: MutationFinding[];
  rawFindings: RawFinding[];
  prismaRawFragments: RawFinding[];
  violations: string[];
};

function scriptKind(file: string) {
  switch (path.extname(file)) {
    case ".tsx": return ts.ScriptKind.TSX;
    case ".jsx": return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs": return ts.ScriptKind.JS;
    default: return ts.ScriptKind.TS;
  }
}

function textDigest(value: string) {
  return createHash("sha256").update(value.replaceAll("\r\n", "\n")).digest("hex");
}

function walk(relativeRoot: string, include: (file: string) => boolean) {
  const results: string[] = [];
  const visit = (relativePath: string) => {
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (!existsSync(absolutePath)) return;
    const segments = relativePath.replaceAll("\\", "/").split("/");
    if (segments.some((segment) => excludedSegments.has(segment))) return;
    if (statSync(absolutePath).isDirectory()) {
      for (const name of readdirSync(absolutePath)) visit(path.join(relativePath, name));
    } else if (include(relativePath.replaceAll("\\", "/"))) {
      results.push(relativePath.replaceAll("\\", "/"));
    }
  };
  visit(relativeRoot);
  return results.sort();
}

function runtimeFiles() {
  return ["apps", "packages"].flatMap((root) =>
    walk(root, (file) =>
      file.includes("/src/") &&
      sourceExtensions.has(path.extname(file)) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) &&
      !file.endsWith(".d.ts"),
    ),
  );
}

function toolingFiles() {
  return [
    ...walk("scripts", (file) =>
      [".sql", ".mjs", ".cjs", ".js", ".ts"].includes(path.extname(file)) &&
      !/\.(?:test|spec)\./.test(file),
    ),
    ...walk("packages/database/prisma", (file) => file.endsWith(".sql")),
    ...walk("infra", (file) => file.endsWith(".sql")),
  ].sort();
}

function propertyName(node: ts.Expression): { name: string | null; computed: boolean } {
  if (ts.isPropertyAccessExpression(node)) return { name: node.name.text, computed: false };
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    return {
      name: argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
        ? argument.text
        : null,
      computed: true,
    };
  }
  return { name: null, computed: false };
}

function functionOwner(node: ts.Node) {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current)) return current.name?.text ?? "<anonymous-function>";
    if (ts.isMethodDeclaration(current)) return current.name.getText();
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
      if (ts.isPropertyAssignment(parent)) return parent.name.getText();
      // Anonymous transaction and array callbacks inherit the nearest named
      // producer. Returning here would erase the server action/service owner.
      continue;
    }
  }
  return "<top-level>";
}

function functionOwnerNode(node: ts.Node) {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) return current;
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (
        (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name))
        || ts.isPropertyAssignment(parent)
      ) return current;
    }
  }
  return null;
}

function namedObjectElement(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find((property) => {
    if (!property.name) return false;
    return property.name.getText().replace(/["']/g, "") === name;
  });
}

function nestedWrites(
  file: string,
  call: ts.CallExpression,
  object: ts.ObjectLiteralExpression,
  relation: string,
  violations: string[],
): ApprovalGraphMutationOperation[] {
  const element = namedObjectElement(object, relation);
  if (!element) return [];
  if (!ts.isPropertyAssignment(element)) {
    violations.push(`${file}:opaque-nested-relation:${relation}:${call.getText()}`);
    return [];
  }
  const property = element;
  if (!ts.isObjectLiteralExpression(property.initializer)) {
    violations.push(`${file}:opaque-nested-relation:${relation}:${call.getText()}`);
    return [];
  }
  if (property.initializer.properties.some(ts.isSpreadAssignment)) {
    violations.push(`${file}:spread-nested-relation:${relation}:${call.getText()}`);
  }
  return property.initializer.properties.flatMap((nestedProperty) => {
    if (!ts.isPropertyAssignment(nestedProperty)) return [];
    const operation = nestedProperty.name.getText().replace(/["']/g, "");
    return nestedMutationSet.has(operation)
      ? [operation as ApprovalGraphMutationOperation]
      : [];
  });
}

function analyzeSource(file: string, source: string): SourceAnalysis {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const findings: MutationFinding[] = [];
  const rawFindings: RawFinding[] = [];
  const prismaRawFragments: RawFinding[] = [];
  const violations: string[] = [];
  const importedIdentifiers = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const clause = statement.importClause;
    if (clause.name) importedIdentifiers.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) importedIdentifiers.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) importedIdentifiers.add(element.name.text);
    }
  }

  const add = (
    node: ts.Node,
    model: string,
    operation: string,
    access: MutationFinding["access"],
  ) => {
    if (!modelSet.has(model) || !operationSet.has(operation)) return;
    const owner = functionOwner(node);
    if (owner === "<top-level>") violations.push(`${file}:unowned:${model}.${operation}`);
    findings.push({
      file,
      owner,
      model: model as ApprovalGraphModel,
      operation: operation as ApprovalGraphMutationOperation,
      access,
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isBindingElement(node)) {
      const name = node.propertyName?.getText() ?? node.name.getText();
      if (modelSet.has(name.replace(/["']/g, ""))) {
        violations.push(`${file}:protected-delegate-destructure:${name}`);
      }
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const delegate = propertyName(node);
      if (delegate.name && modelSet.has(delegate.name)) {
        const operationExpression = node.parent;
        const immediateLiteralCall =
          !delegate.computed
          && (ts.isPropertyAccessExpression(operationExpression) || ts.isElementAccessExpression(operationExpression))
          && operationExpression.expression === node
          && !propertyName(operationExpression).computed
          && propertyName(operationExpression).name !== null
          && knownDelegateOperations.has(propertyName(operationExpression).name!)
          && ts.isCallExpression(operationExpression.parent)
          && operationExpression.parent.expression === operationExpression;
        if (!immediateLiteralCall) {
          violations.push(`${file}:protected-delegate-escape:${node.getText()}`);
        }
      }
      if (delegate.computed && delegate.name && modelSet.has(delegate.name)) {
        violations.push(`${file}:computed-protected-delegate:${node.getText()}`);
      }
    }

    if (ts.isCallExpression(node)) {
      const operationAccess = propertyName(node.expression);
      const delegateExpression =
        ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression)
          ? node.expression.expression
          : null;
      if (
        ts.isElementAccessExpression(node.expression)
        && node.expression.argumentExpression
        && !ts.isStringLiteral(node.expression.argumentExpression)
        && !ts.isNoSubstitutionTemplateLiteral(node.expression.argumentExpression)
      ) {
        const receiver = node.expression.expression;
        if (ts.isElementAccessExpression(receiver)) {
          violations.push(`${file}:fully-dynamic-delegate-call:${node.expression.getText()}`);
        }
        if (
          ts.isIdentifier(receiver)
          && /^(?:tx|prisma|db|client)$/i.test(receiver.text)
        ) {
          violations.push(`${file}:computed-raw-call:${node.expression.getText()}`);
        }
      }

      if (delegateExpression && operationAccess.name && rawMethodSet.has(operationAccess.name)) {
        const owner = functionOwner(node);
        const ownerNode = functionOwnerNode(node);
        if (owner === "<top-level>") violations.push(`${file}:unowned-raw-call:${node.expression.getText()}`);
        if (operationAccess.computed) violations.push(`${file}:computed-raw-call:${node.expression.getText()}`);
        const argument = node.arguments[0];
        if (!argument) violations.push(`${file}:missing-raw-sql:${node.expression.getText()}`);
        if (argument && ts.isBinaryExpression(argument)) {
          violations.push(`${file}:concatenated-raw-sql:${node.expression.getText()}`);
        }
        if (argument) {
          const inspectImported = (fragment: ts.Node) => {
            if (ts.isIdentifier(fragment) && importedIdentifiers.has(fragment.text)) {
              violations.push(`${file}:imported-raw-fragment:${fragment.text}`);
            }
            ts.forEachChild(fragment, inspectImported);
          };
          inspectImported(argument);
        }
        rawFindings.push({
          file,
          owner,
          method: operationAccess.name as RawFinding["method"],
          ownerBodyDigest: textDigest(ownerNode?.getText(sourceFile) ?? "<top-level>"),
          dynamicArgument: !argument
            || (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument)),
        });
      }

      if (
        delegateExpression
        && operationAccess.name === "raw"
        && ts.isIdentifier(delegateExpression)
        && delegateExpression.text === "Prisma"
      ) {
        const owner = functionOwner(node);
        const ownerNode = functionOwnerNode(node);
        const argument = node.arguments[0];
        prismaRawFragments.push({
          file,
          owner,
          method: "$queryRawUnsafe",
          ownerBodyDigest: textDigest(ownerNode?.getText(sourceFile) ?? "<top-level>"),
          dynamicArgument: !argument
            || (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument)),
        });
      }

      if (delegateExpression && operationAccess.name && directMutationSet.has(operationAccess.name)) {
        const delegateAccess = propertyName(delegateExpression);
        if (operationAccess.computed || delegateAccess.computed) {
          violations.push(`${file}:computed-or-dynamic-delegate:${node.expression.getText()}`);
        }
        if (delegateAccess.name && modelSet.has(delegateAccess.name) && !operationAccess.computed && !delegateAccess.computed) {
          add(node, delegateAccess.name, operationAccess.name, "DIRECT_DELEGATE");
        }

        if (
          nestedCapableDirectOperations.has(operationAccess.name)
          && delegateAccess.name
          && nestedCarrierModels.has(delegateAccess.name)
        ) {
          const argument = node.arguments[0];
          const payloads: ts.ObjectLiteralExpression[] = [];
          if (!argument || !ts.isObjectLiteralExpression(argument)) {
            violations.push(`${file}:opaque-nested-args:${node.expression.getText()}`);
          } else {
            if (argument.properties.some(ts.isSpreadAssignment)) {
              violations.push(`${file}:spread-nested-args:${node.expression.getText()}`);
            }
            const branchNames = operationAccess.name === "upsert" ? ["create", "update"] : ["data"];
            for (const branchName of branchNames) {
              const branch = namedObjectElement(argument, branchName);
              if (!branch || !ts.isPropertyAssignment(branch) || !ts.isObjectLiteralExpression(branch.initializer)) {
                violations.push(`${file}:opaque-nested-${branchName}:${node.expression.getText()}`);
              } else {
                payloads.push(branch.initializer);
              }
            }
          }
          for (const data of payloads) {
            if (data.properties.some(ts.isSpreadAssignment)) {
              violations.push(`${file}:spread-nested-data:${node.expression.getText()}`);
            }
            if (delegateAccess.name === "approvalInstance") {
              for (const operation of nestedWrites(file, node, data, "steps", violations)) {
                add(node, "approvalInstanceStep", operation, "NESTED_RELATION");
              }
            }
            if (delegateAccess.name === "approvalInstanceStepScopeGroup") {
              for (const operation of nestedWrites(file, node, data, "targets", violations)) {
                add(node, "approvalInstanceStepScopeTarget", operation, "NESTED_RELATION");
              }
            }
            for (const operation of nestedWrites(file, node, data, "approvalInstance", violations)) {
              add(node, "approvalInstance", operation, "NESTED_RELATION");
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { findings, rawFindings, prismaRawFragments, violations };
}

function findingCounts(findings: MutationFinding[]) {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    const file = finding.file.replace("apps/web/src/server/", "");
    const key = `${file}|${finding.owner}|${finding.model}|${finding.operation}|${finding.access}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function inventoryCounts() {
  const counts = new Map<string, number>();
  for (const entry of approvalGraphMutationInventory) {
    for (const mutation of entry.mutations) {
      const key = `${entry.file}|${entry.functionName}|${mutation.model}|${mutation.operation}|${mutation.access}`;
      counts.set(key, (counts.get(key) ?? 0) + mutation.count);
    }
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function rawFindingCounts(findings: RawFinding[]) {
  const counts = new Map<string, { count: number; dynamicArgumentCount: number; digests: Set<string> }>();
  for (const finding of findings) {
    const key = `${finding.file}|${finding.owner}|${finding.method}`;
    const current = counts.get(key) ?? { count: 0, dynamicArgumentCount: 0, digests: new Set<string>() };
    current.count += 1;
    current.dynamicArgumentCount += finding.dynamicArgument ? 1 : 0;
    current.digests.add(finding.ownerBodyDigest);
    counts.set(key, current);
  }
  return [...counts.entries()].map(([key, value]) => [key, {
    count: value.count,
    dynamicArgumentCount: value.dynamicArgumentCount,
    ownerBodyDigest: [...value.digests].join(","),
  }] as const).sort(([left], [right]) => left.localeCompare(right));
}

function rawInventoryCounts() {
  return approvalRawSqlCallInventory.map((entry) => [
    `${entry.file}|${entry.functionName}|${entry.method}`,
    {
      count: entry.count,
      dynamicArgumentCount: entry.dynamicArgumentCount,
      ownerBodyDigest: entry.ownerBodyDigest,
    },
  ] as const).sort(([left], [right]) => left.localeCompare(right));
}

function stripSqlComments(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
}

const protectedSqlRelations = [
  "ApprovalInstance", "ApprovalInstanceStep", "ApprovalInstanceStepScopeGroup",
  "ApprovalInstanceStepScopeTarget", "ApprovalInstanceStepProhibitedActor",
  "ApprovalRoutingProducerProvenance",
].sort((left, right) => right.length - left.length);

function sqlMutationFindings(file: string, source: string) {
  const relation = `(?:${protectedSqlRelations.join("|")})`;
  const pattern = new RegExp(
    `\\b(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?|MERGE\\s+INTO|COPY)\\s+(?:(?:"[^"]+"|[A-Za-z_][\\w$]*)\\s*\\.\\s*)?"?(${relation})"?(?![A-Za-z0-9_])`,
    "gi",
  );
  return [...stripSqlComments(source).matchAll(pattern)].map((match) => ({
    file,
    operation: match[1]!.split(/\s+/)[0]!.toUpperCase(),
    relation: match[2]!,
  }));
}

function protectedReference(source: string) {
  return protectedSqlRelations.some((relation) => source.includes(relation));
}

function moduleReferences(file: string, source: string, target: string) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const references: string[] = [];
  const matches = (specifier: ts.Expression | undefined) =>
    Boolean(specifier && ts.isStringLiteralLike(specifier) && specifier.text.includes(target));
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && matches(node.moduleSpecifier)) references.push("import");
    if (ts.isExportDeclaration(node) && matches(node.moduleSpecifier)) references.push("export-from");
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression)
        && node.expression.text === "require"
        && matches(node.arguments[0])
      ) references.push("require");
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && matches(node.arguments[0])) {
        references.push("dynamic-import");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

describe("DEC-0247 C1-D dormant observer design contract", () => {
  test("pins a deeply frozen, non-executable exact 18-family manifest", () => {
    expect(APPROVAL_PRODUCER_CAPABILITY_VERSION).toBe("dec-0247-c1.dormant-binary-observer-design.1");
    expect(APPROVAL_PRODUCER_CAPABILITY_MANIFEST_DIGEST).toBe(
      "f692d28f5b5244dfaccffb1085ce2584e5588e0f56c79ad730d3d5a492a7f1cd",
    );
    expect(Object.isFrozen(approvalProducerCapabilityManifest)).toBe(true);
    expect(approvalProducerCapabilityContracts).toHaveLength(18);
    expect(Object.keys(approvalProducerCapabilityManifest).sort()).toEqual([...supportedApprovalDocumentTypes].sort());
    expect(new Set(approvalProducerCapabilityContracts.map((item) => item.producerId)).size).toBe(18);
    expect(canonicalApprovalDocumentTypes).toEqual([
      "PurchaseRequest", "QuotationRecommendation", "PurchaseOrder",
      "PurchaseOrderBalanceClosure", "PurchaseOrderAmendment", "WastageReport",
      "StockAdjustment",
    ]);
    expect(specializedApprovalDocumentTypes).toEqual([
      "BudgetRevision", "ExpenseRequest", "CashAdvanceRequest", "PettyCashRequest",
      "PaymentRequest", "PaymentRelease", "EmployeeLeaveRequest",
      "EmployeeOvertimeRecord", "WorkforceSchedule", "AttendanceImportBatch",
    ]);
    expect(financeCloseApprovalDocumentTypes).toEqual(["FinanceCloseRun"]);
    expect(activateNextApprovalDocumentTypes).toEqual([
      ...canonicalApprovalDocumentTypes,
      ...specializedApprovalDocumentTypes,
    ]);

    const expectedObserverNames = {
      PurchaseRequest: "approval_shadow.observe_purchase_request_v1",
      QuotationRecommendation: "approval_shadow.observe_quotation_recommendation_v1",
      PurchaseOrder: "approval_shadow.observe_purchase_order_v1",
      PurchaseOrderBalanceClosure: "approval_shadow.observe_purchase_order_balance_closure_v1",
      PurchaseOrderAmendment: "approval_shadow.observe_purchase_order_amendment_v1",
      WastageReport: "approval_shadow.observe_wastage_report_v1",
      StockAdjustment: "approval_shadow.observe_stock_adjustment_v1",
      FinanceCloseRun: "approval_shadow.observe_finance_close_run_v1",
      BudgetRevision: "approval_shadow.observe_budget_revision_v1",
      ExpenseRequest: "approval_shadow.observe_expense_request_v1",
      CashAdvanceRequest: "approval_shadow.observe_cash_advance_request_v1",
      PettyCashRequest: "approval_shadow.observe_petty_cash_request_v1",
      PaymentRequest: "approval_shadow.observe_payment_request_v1",
      PaymentRelease: "approval_shadow.observe_payment_release_v1",
      EmployeeLeaveRequest: "approval_shadow.observe_employee_leave_request_v1",
      EmployeeOvertimeRecord: "approval_shadow.observe_employee_overtime_record_v1",
      WorkforceSchedule: "approval_shadow.observe_workforce_schedule_v1",
      AttendanceImportBatch: "approval_shadow.observe_attendance_import_batch_v1",
    } as const;
    expect(new Set(approvalProducerCapabilityContracts.map(
      (contract) => contract.observerDesign.proposedName,
    )).size).toBe(18);

    for (const contract of approvalProducerCapabilityContracts) {
      expect(contract.contractKind).toBe("DORMANT_DISCOVERY_CONTRACT");
      expect(contract.executable).toBe(false);
      expect(contract.grantsAuthority).toBe(false);
      expect(contract.requiredCapability.signature).toBeNull();
      expect(contract.requiredCapability.inputDesignStatus).toBe("DEFERRED_FAMILY_SPECIFIC_DESIGN");
      expect(contract.requiredCapability.parametersAreBindingsNotAuthority).toBe(true);
      expect(contract.requiredCapability.requiredPermissionCode).toBe(approvalRoutingPolicies[contract.documentType].requiredPermissionCode);
      expect(contract.currentCompatibility.routingObserved.prohibitedActors).toEqual(approvalRoutingPolicies[contract.documentType].prohibitedActorSources);
      expect(contract.currentCompatibility.routingObserved).not.toEqual(contract.requiredCapability.derivation);
      expect(JSON.stringify(contract.currentCompatibility.routingObserved)).not.toMatch(/\blocked\b/i);
      expect(contract.requiredCapability.stableErrors).toEqual(expect.arrayContaining(Object.values(approvalProducerStableErrors)));
      expect(Object.isFrozen(contract.currentCompatibility)).toBe(true);
      expect(Object.isFrozen(contract.requiredCapability)).toBe(true);
      expect(contract.observerDesign).toMatchObject({
        contractKind: "DORMANT_BINARY_SHADOW_OBSERVER_DESIGN",
        proposedName: expectedObserverNames[contract.documentType],
        signature: "(p_tenant_id uuid, p_company_id uuid, p_approval_instance_id uuid)",
        parameters: ["p_tenant_id", "p_company_id", "p_approval_instance_id"],
        parametersAreBindingsNotAuthority: true,
        fixedDocumentType: contract.documentType,
        noMatchSemantics: expect.stringContaining("collapse identically"),
        resultDesign: {
          values: ["SHADOW_MATCH", "SHADOW_NO_MATCH"],
          authoritative: false,
          payload: "NONE",
        },
        futureRoutineRequirements: {
          security: "SECURITY INVOKER",
          volatility: "STABLE",
          leakproof: false,
          exposure: "PRIVATE_UNGRANTED",
          allowsDml: false,
          acquiresLocks: false,
          allowsDynamicSql: false,
        },
        executable: false,
        sqlExists: false,
        grantsAuthority: false,
      });
      expect(contract.observerDesign.derivation).toMatchObject({
        documentId: expect.stringContaining("ApprovalInstance.documentId"),
        sourceRelation: contract.currentCompatibility.sourceRelation,
        parentLineage: expect.any(String),
      });
      expect(contract.observerDesign.derivation.parentLineage.length).toBeGreaterThan(8);
      expect(Object.keys(contract.observerDesign.resultDesign).sort()).toEqual([
        "authoritative", "payload", "values",
      ]);
      expect(JSON.stringify(contract.observerDesign.resultDesign)).not.toMatch(
        /identifier|reason|count|hash|readiness|evidence/i,
      );
      expect(Object.isFrozen(contract.observerDesign)).toBe(true);
    }
    expect(approvalProducerCapabilityManifest.PurchaseRequest.currentCompatibility.routingObserved.due).toContain("UTC midnight");
    expect(approvalProducerCapabilityManifest.BudgetRevision.currentCompatibility.transactionControl.replay).toBe("ABSENT");
    expect(approvalProducerCapabilityManifest.PurchaseOrderAmendment.currentCompatibility.transactionControl.lock).not.toBe("IMPLEMENTED");
    expect(new Set(approvalProducerCapabilityContracts.map(
      (contract) => `${contract.currentCompatibility.producer.serviceFile}:${contract.currentCompatibility.producer.functionName}`,
    )).size).toBe(18);
    for (const family of ["PurchaseOrderBalanceClosure", "PurchaseOrderAmendment", "PaymentRelease"] as const) {
      expect(approvalProducerCapabilityManifest[family].identityLifecycle?.unresolvedRequiredDesign).toContain("Define");
      expect(approvalProducerCapabilityManifest[family].observerDesign.derivation.lifecycle).toBe("POST_CHILD_ONLY");
    }
    for (const family of supportedApprovalDocumentTypes.filter(
      (documentType) => !["PurchaseOrderBalanceClosure", "PurchaseOrderAmendment", "PaymentRelease"].includes(documentType),
    )) {
      expect(approvalProducerCapabilityManifest[family].observerDesign.derivation.lifecycle).toBe("POST_SOURCE_ONLY");
    }
    expect(toolingFiles().filter((file) =>
      readFileSync(path.join(repositoryRoot, file), "utf8").includes("approval_shadow.observe_"),
    )).toEqual([]);
  });

  test("keeps the manifest and inventory transitively test-only", () => {
    const files = runtimeFiles();
    const manifestImporters = files.filter((file) => moduleReferences(
      file,
      readFileSync(path.join(repositoryRoot, file), "utf8"),
      "approvalProducerCapabilityManifest",
    ).length > 0);
    const inventoryImporters = files.filter((file) => moduleReferences(
      file,
      readFileSync(path.join(repositoryRoot, file), "utf8"),
      "approvalGraphMutationInventory",
    ).length > 0);
    expect(manifestImporters).toEqual(["apps/web/src/server/services/approvalGraphMutationInventory.ts"]);
    expect(inventoryImporters).toEqual([]);
    expect(moduleReferences("imports-fixture.ts", `
      import manifest from "./approvalProducerCapabilityManifest";
      export { manifest } from "./approvalProducerCapabilityManifest";
      require("./approvalProducerCapabilityManifest");
      import("./approvalProducerCapabilityManifest");
    `, "approvalProducerCapabilityManifest")).toEqual([
      "import", "export-from", "require", "dynamic-import",
    ]);
  });
});

describe("DEC-0247 C0 TypeScript compiler mutation guard", () => {
  test("matches the exact owned direct and nested runtime inventory", () => {
    const analysis = runtimeFiles().map((file) =>
      analyzeSource(file, readFileSync(path.join(repositoryRoot, file), "utf8")),
    );
    expect(analysis.flatMap((item) => item.violations)).toEqual([]);
    expect(findingCounts(analysis.flatMap((item) => item.findings))).toEqual(inventoryCounts());
    const entry = (id: string) => approvalGraphMutationInventory.find((item) => item.id === id)?.documentTypes;
    expect(entry("decision.activate-next-legacy")).toEqual(activateNextApprovalDocumentTypes);
    expect(entry("decision.canonical-approve")).toEqual(canonicalApprovalDocumentTypes);
    expect(entry("decision.canonical-close")).toEqual(canonicalApprovalDocumentTypes);
    expect(entry("decision.specialized-current-step")).toEqual(specializedApprovalDocumentTypes);
    expect(entry("decision.specialized-instance")).toEqual(specializedApprovalDocumentTypes);
    expect(entry("decision.finance-close-step")).toEqual(financeCloseApprovalDocumentTypes);
    expect(entry("decision.finance-close-instance")).toEqual(financeCloseApprovalDocumentTypes);
  });

  test("rejects aliases, destructuring, brackets, dynamics, nesting, and unowned calls while ignoring comments and strings", () => {
    const fixture = `
      // tx.approvalInstance.delete({});
      const text = "tx.approvalInstance.update({})";
      const arrowOwner = async () => tx.approvalInstance.updateMany({});
      const alias = tx.approvalInstance;
      const { approvalInstance } = tx;
      tx["approvalInstance"].create({});
      tx[model].create({});
      tx.approvalInstance[operation]({});
      consume(tx.approvalInstance);
      const wrapped = (tx.approvalInstance);
      const assignedObject = { delegate: tx.approvalInstance };
      const spreadObject = { ...tx.approvalInstance };
      function destructuredParameter({ approvalInstance }) { return approvalInstance; }
      function returnedDelegate() { return tx.approvalInstance; }
      tx[model][operation]({});
      tx.approvalInstance.createManyAndReturn({ data: [] });
      tx.approvalInstance.updateManyAndReturn({ data: {} });
      tx.expenseRequest.create({ data: { approvalInstance: { create: {} } } });
      tx.expenseRequest.create({ data: { approvalInstance: nestedGraph } });
      tx.expenseRequest.create({ data: { ...nestedGraph } });
      tx.approvalInstance.deleteMany({});
    `;
    const analysis = analyzeSource("fixture.ts", fixture);
    expect(analysis.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: "arrowOwner", model: "approvalInstance", operation: "updateMany" }),
      expect.objectContaining({ model: "approvalInstance", operation: "create", access: "NESTED_RELATION" }),
    ]));
    expect(analysis.violations.join("\n")).toMatch(/protected-delegate-escape/);
    expect(analysis.violations.join("\n")).toMatch(/destructure/);
    expect(analysis.violations.join("\n")).toMatch(/computed-or-dynamic/);
    expect(analysis.violations.join("\n")).toMatch(/unowned/);
    expect(analysis.violations.join("\n")).toMatch(/fully-dynamic-delegate-call/);
    expect(analysis.violations.join("\n")).toMatch(/opaque-nested-relation/);
    expect(analysis.violations.join("\n")).toMatch(/spread-nested-data/);
    expect(analysis.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: "createManyAndReturn" }),
      expect.objectContaining({ operation: "updateManyAndReturn" }),
    ]));
    expect(analysis.findings.filter((item) => item.operation === "update")).toHaveLength(0);
  });

  test("detects every supported nested relation effect", () => {
    for (const operation of approvalGraphNestedMutationOperations) {
      const analysis = analyzeSource(
        "nested-fixture.ts",
        `async function owner() { return tx.expenseRequest.create({ data: { approvalInstance: { ${operation}: {} } } }); }`,
      );
      expect(analysis.findings).toEqual([
        expect.objectContaining({ model: "approvalInstance", operation, access: "NESTED_RELATION" }),
      ]);
    }
  });

  test("fails closed on shorthand data and whole-argument indirection for nested carriers", () => {
    const shorthand = analyzeSource("shorthand-fixture.ts", `
      const data = { approvalInstance: { create: {} } };
      async function owner() { return tx.expenseRequest.create({ data }); }
    `);
    const wholeArgs = analyzeSource("args-fixture.ts", `
      const args = { data: { approvalInstance: { create: {} } } };
      async function owner() { return tx.expenseRequest.create(args); }
    `);
    expect(shorthand.violations.join("\n")).toMatch(/opaque-nested-data/);
    expect(wholeArgs.violations.join("\n")).toMatch(/opaque-nested-args/);
  });

  test("pins every unsafe raw call and rejects unsafe fragment bypasses", () => {
    const analysis = runtimeFiles().map((file) =>
      analyzeSource(file, readFileSync(path.join(repositoryRoot, file), "utf8")),
    );
    expect(rawFindingCounts(analysis.flatMap((item) => item.rawFindings))).toEqual(rawInventoryCounts());
    expect(analysis.flatMap((item) => item.prismaRawFragments)).toEqual(prismaRawFragmentInventory);
    for (const entry of approvalRawSqlCallInventory) {
      if (entry.dynamicArgumentCount > 0) expect(entry.dynamicArgumentReview).toMatch(/Reviewed/);
      else expect(entry.dynamicArgumentReview).toBeUndefined();
    }

    const bodyA = analyzeSource("body-a.ts", `function owner() { return tx.$queryRawUnsafe("SELECT 1"); }`);
    const bodyB = analyzeSource("body-b.ts", `function owner() { return tx.$queryRawUnsafe("SELECT 2"); }`);
    expect(bodyA.rawFindings[0]?.ownerBodyDigest).not.toBe(bodyB.rawFindings[0]?.ownerBodyDigest);

    const fixture = analyzeSource("raw-fixture.ts", `
      import { fragment } from "./fragment";
      function owner() {
        tx.$queryRawUnsafe("SELECT 1" + suffix);
        tx.$queryRawUnsafe(fragment);
        tx[rawMethod]("SELECT 1");
        Prisma.raw("SELECT 1");
      }
    `);
    expect(fixture.violations.join("\n")).toMatch(/concatenated-raw-sql/);
    expect(fixture.violations.join("\n")).toMatch(/imported-raw-fragment/);
    expect(fixture.violations.join("\n")).toMatch(/computed-raw-call|fully-dynamic/);
    expect(fixture.prismaRawFragments).toHaveLength(1);
  });
});

describe("DEC-0247 C0 repository SQL/tooling guard", () => {
  test("rejects protected DML in every runtime source", () => {
    const findings = runtimeFiles().flatMap((file) =>
      sqlMutationFindings(file, readFileSync(path.join(repositoryRoot, file), "utf8")),
    );
    expect(findings).toEqual([]);
    expect(sqlMutationFindings("isolated-runtime-fixture.ts", `
      await tx.$executeRawUnsafe('DELETE FROM private."ApprovalInstanceStep"');
    `)).toEqual([
      { file: "isolated-runtime-fixture.ts", operation: "DELETE", relation: "ApprovalInstanceStep" },
    ]);
  });
  test("matches intentional non-runtime mutations and classifies every protected tooling reference", () => {
    const files = toolingFiles();
    const actualMutations = files.flatMap((file) =>
      sqlMutationFindings(file, readFileSync(path.join(repositoryRoot, file), "utf8")),
    );
    const actualCounts = new Map<string, number>();
    for (const item of actualMutations) {
      const key = `${item.file}|${item.operation}|${item.relation}`;
      actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
    }
    const expectedCounts = approvalGraphToolingMutationInventory.map((item) => [
      `${item.file}|${item.operation}|${item.relation}`,
      item.count,
    ] as const).sort(([left], [right]) => left.localeCompare(right));
    expect([...actualCounts.entries()].sort(([left], [right]) => left.localeCompare(right))).toEqual(expectedCounts);

    const classified = new Set<string>([
      ...approvalGraphToolingDdlInventory,
      ...approvalGraphToolingProbeInventory,
      ...approvalGraphToolingMutationInventory.map((item) => item.file),
    ]);
    const referenced = files.filter((file) =>
      protectedReference(readFileSync(path.join(repositoryRoot, file), "utf8")),
    );
    expect(referenced.filter((file) => !classified.has(file))).toEqual([]);
    expect([...classified].filter((file) => !referenced.includes(file))).toEqual([]);
  });

  test("detects quoted-schema DML, MERGE, COPY, and ignores SQL comments", () => {
    const fixture = `
      -- DELETE FROM public."ApprovalInstance";
      /* TRUNCATE "ApprovalInstanceStep"; */
      INSERT INTO "private"."ApprovalInstance" (id) VALUES ('x');
      UPDATE public."ApprovalInstanceStep" SET status = 'WAITING';
      MERGE INTO audit."ApprovalInstanceStepScopeGroup" target USING source ON false WHEN NOT MATCHED THEN INSERT DEFAULT VALUES;
      COPY public."ApprovalInstanceStepScopeTarget" FROM STDIN;
    `;
    expect(sqlMutationFindings("fixture.sql", fixture).map((item) => item.operation)).toEqual([
      "INSERT", "UPDATE", "MERGE", "COPY",
    ]);
  });
});
