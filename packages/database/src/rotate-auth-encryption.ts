import { prisma } from "./client";
import { rotateAuthenticationEncryption } from "./authEncryption";

rotateAuthenticationEncryption({
  batchSize: Number(process.env.AUTH_ENCRYPTION_ROTATION_BATCH_SIZE ?? 100),
})
  .then((result) => {
    console.log(JSON.stringify(result));
    if (!result.complete) {
      throw new Error("AUTH_ENCRYPTION_ROTATION_INCOMPLETE");
    }
  })
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "AUTH_ENCRYPTION_ROTATION_FAILED",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
