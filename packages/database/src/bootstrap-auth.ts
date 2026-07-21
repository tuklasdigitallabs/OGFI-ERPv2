import { createHash, randomBytes } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./client";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name}_REQUIRED`);
  }
  return value;
}

export async function runBootstrapAuth() {
  const tenantCode = required("AUTH_BOOTSTRAP_TENANT_CODE").toLowerCase();
  const userEmail = required("AUTH_BOOTSTRAP_USER_EMAIL").toLowerCase();
  const authorizationReference = required(
    "AUTH_BOOTSTRAP_AUTHORIZATION_REFERENCE",
  );
  const outputFile = required("AUTH_BOOTSTRAP_OUTPUT_FILE");
  const appUrl = required("APP_URL").replace(/\/$/, "");
  if (!path.isAbsolute(outputFile)) {
    throw new Error("AUTH_BOOTSTRAP_OUTPUT_FILE_MUST_BE_ABSOLUTE");
  }
  if (authorizationReference.length < 8) {
    throw new Error("AUTH_BOOTSTRAP_AUTHORIZATION_REFERENCE_INVALID");
  }

  const now = new Date();
  const user = await prisma.user.findFirst({
    where: {
      email: { equals: userEmail, mode: "insensitive" },
      status: "ACTIVE",
      tenant: { loginCode: tenantCode, status: "ACTIVE" },
    },
    include: {
      tenant: true,
      roleAssignments: {
        where: {
          status: "ACTIVE",
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
      scopeAssignments: {
        where: {
          scopeType: "COMPANY",
          status: "ACTIVE",
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
      },
    },
  });
  if (!user) {
    throw new Error("AUTH_BOOTSTRAP_USER_NOT_FOUND");
  }
  const isAdministrator = user.roleAssignments.some(
    ({ role }) =>
      role.status === "ACTIVE" &&
      role.permissions.some(
        ({ permission }) => permission.code === "core.administer",
      ),
  );
  if (!isAdministrator) {
    throw new Error("AUTH_BOOTSTRAP_ADMIN_ROLE_REQUIRED");
  }
  const companyScopeIds = user.scopeAssignments.map(({ scopeId }) => scopeId);
  const companyScope = await prisma.company.findFirst({
    where: { id: { in: companyScopeIds }, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!companyScope) {
    throw new Error("AUTH_BOOTSTRAP_COMPANY_SCOPE_REQUIRED");
  }
  const existingIdentityCount = await prisma.authIdentity.count({
    where: { tenantId: user.tenantId },
  });
  const existingBootstrap = await prisma.authBootstrapState.findUnique({
    where: { tenantId: user.tenantId },
  });
  if (existingIdentityCount > 0 || existingBootstrap) {
    throw new Error("AUTH_BOOTSTRAP_ALREADY_COMPLETED");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const output = [
    `${appUrl}/activate?token=${encodeURIComponent(token)}`,
    `Expires at: ${expiresAt.toISOString()}`,
    `Authorization reference: ${authorizationReference}`,
    "",
  ].join("\n");
  await writeFile(outputFile, output, { flag: "wx", mode: 0o600 });

  try {
    await prisma.$transaction(async (tx) => {
      const identityCount = await tx.authIdentity.count({
        where: { tenantId: user.tenantId },
      });
      if (identityCount > 0) {
        throw new Error("AUTH_BOOTSTRAP_ALREADY_COMPLETED");
      }
      await tx.authBootstrapState.create({
        data: {
          tenantId: user.tenantId,
          targetUserId: user.id,
          authorizationReference,
        },
      });
      await tx.authActivationToken.updateMany({
        where: {
          tenantId: user.tenantId,
          targetUserId: user.id,
          status: "ACTIVE",
        },
        data: { status: "REVOKED" },
      });
      const activation = await tx.authActivationToken.create({
        data: {
          tenantId: user.tenantId,
          targetUserId: user.id,
          tokenHash,
          deliveryStatus: "BOOTSTRAP_HANDOFF",
          expiresAt,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          companyId: companyScope.id,
          actorUserId: null,
          eventType: "auth.activation.bootstrap_issued",
          entityType: "AuthActivationToken",
          entityId: activation.id,
          afterData: {
            expiresAt: expiresAt.toISOString(),
            targetUserId: user.id,
          },
          metadata: {
            sourceDecisionId: "DEC-0040",
            bootstrap: true,
            authorizationReference,
          },
        },
      });
    });
  } catch (error) {
    await unlink(outputFile).catch(() => undefined);
    throw error;
  }

  console.log(
    `Bootstrap activation written to the restricted file ${outputFile}.`,
  );
  console.log(`Expires at: ${expiresAt.toISOString()}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runBootstrapAuth()
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : "AUTH_BOOTSTRAP_FAILED",
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
