import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { prisma } from "./client";

function decodeKey(value: string, name: string) {
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) {
    throw new Error(`${name}_INVALID`);
  }
  return decoded;
}

export function loadAuthEncryptionRotationKeyring() {
  const currentVersion = Number(process.env.APP_ENCRYPTION_KEY_VERSION ?? 0);
  const previousVersion = Number(
    process.env.APP_ENCRYPTION_PREVIOUS_KEY_VERSION ?? 0,
  );
  if (
    !Number.isInteger(currentVersion) ||
    currentVersion < 1 ||
    !Number.isInteger(previousVersion) ||
    previousVersion < 1 ||
    currentVersion === previousVersion
  ) {
    throw new Error("AUTH_ENCRYPTION_ROTATION_VERSIONS_INVALID");
  }
  const currentKey = decodeKey(
    process.env.APP_ENCRYPTION_KEY ?? "",
    "APP_ENCRYPTION_KEY",
  );
  const previousKey = decodeKey(
    process.env.APP_ENCRYPTION_PREVIOUS_KEY ?? "",
    "APP_ENCRYPTION_PREVIOUS_KEY",
  );
  if (timingSafeEqual(currentKey, previousKey)) {
    throw new Error("AUTH_ENCRYPTION_ROTATION_KEYS_MUST_DIFFER");
  }
  return { currentVersion, previousVersion, currentKey, previousKey };
}

function decryptValue(input: {
  encryptedValue: string;
  iv: string;
  authTag: string;
  key: Buffer;
}) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    input.key,
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function encryptValue(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function encryptAuthValueForRotationTest(
  value: string,
  key: Buffer,
) {
  return encryptValue(value, key);
}

export function decryptAuthValueForRotationTest(input: {
  encryptedValue: string;
  iv: string;
  authTag: string;
  key: Buffer;
}) {
  return decryptValue(input);
}

export async function rotateAuthenticationEncryption(options: {
  batchSize?: number;
  maxBatches?: number;
} = {}) {
  const keyring = loadAuthEncryptionRotationKeyring();
  const batchSize = options.batchSize ?? 100;
  if (
    !Number.isFinite(batchSize) ||
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 500
  ) {
    throw new Error("AUTH_ENCRYPTION_ROTATION_BATCH_SIZE_INVALID");
  }
  const unsupported = await prisma.mfaAuthenticator.count({
    where: {
      keyVersion: {
        notIn: [keyring.currentVersion, keyring.previousVersion],
      },
    },
  });
  if (unsupported > 0) {
    throw new Error("AUTH_ENCRYPTION_UNSUPPORTED_KEY_VERSION");
  }

  let rotated = 0;
  let batches = 0;
  while (options.maxBatches === undefined || batches < options.maxBatches) {
    const authenticators = await prisma.mfaAuthenticator.findMany({
      where: { keyVersion: keyring.previousVersion },
      select: {
        id: true,
        tenantId: true,
        encryptedSecret: true,
        secretIv: true,
        secretAuthTag: true,
      },
      orderBy: { id: "asc" },
      take: batchSize,
    });
    if (authenticators.length === 0) {
      break;
    }
    await prisma.$transaction(async (tx) => {
      for (const authenticator of authenticators) {
        const plaintext = decryptValue({
          encryptedValue: authenticator.encryptedSecret,
          iv: authenticator.secretIv,
          authTag: authenticator.secretAuthTag,
          key: keyring.previousKey,
        });
        const encrypted = encryptValue(plaintext, keyring.currentKey);
        const result = await tx.mfaAuthenticator.updateMany({
          where: {
            id: authenticator.id,
            keyVersion: keyring.previousVersion,
          },
          data: {
            encryptedSecret: encrypted.encryptedValue,
            secretIv: encrypted.iv,
            secretAuthTag: encrypted.authTag,
            keyVersion: keyring.currentVersion,
          },
        });
        if (result.count !== 1) {
          throw new Error("AUTH_ENCRYPTION_ROTATION_CONFLICT");
        }
        await tx.auditEvent.create({
          data: {
            tenantId: authenticator.tenantId,
            actorUserId: null,
            eventType: "auth.encryption.mfa_rotated",
            entityType: "MfaAuthenticator",
            entityId: authenticator.id,
            beforeData: { keyVersion: keyring.previousVersion },
            afterData: { keyVersion: keyring.currentVersion },
            metadata: { sourceDecisionId: "DEC-0040" },
          },
        });
        rotated += 1;
      }
    });
    batches += 1;
  }
  const remainingPrevious = await prisma.mfaAuthenticator.count({
    where: { keyVersion: keyring.previousVersion },
  });
  return {
    currentVersion: keyring.currentVersion,
    previousVersion: keyring.previousVersion,
    rotated,
    batches,
    remainingPrevious,
    complete: remainingPrevious === 0,
  };
}
