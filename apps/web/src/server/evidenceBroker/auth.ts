import { createHash, timingSafeEqual } from "node:crypto";

export function hasValidBrokerAuthorization(
  authorization: string | undefined,
  sharedSecret: string,
) {
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedDigest = createHash("sha256").update(sharedSecret).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

