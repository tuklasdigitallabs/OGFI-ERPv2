import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ClamdInstreamClient } from "./clamd";

const servers: net.Server[] = [];
const now = new Date("2026-07-21T12:00:00.000Z");

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

async function fakeClamd(scanResponse: string, published = now) {
  let scanned = Buffer.alloc(0);
  const server = net.createServer((socket) => {
    let pending = Buffer.alloc(0);
    socket.on("data", (raw) => {
      pending = Buffer.concat([pending, raw]);
      if (pending.subarray(0, 9).toString("ascii") === "zVERSION\0") {
        socket.end(`ClamAV 1.4.3/27899/${published.toUTCString()}\0`);
        return;
      }
      const command = Buffer.from("zINSTREAM\0");
      if (!pending.subarray(0, command.length).equals(command)) return;
      let offset = command.length;
      while (pending.length >= offset + 4) {
        const length = pending.readUInt32BE(offset);
        if (length === 0) {
          socket.end(`${scanResponse}\0`);
          return;
        }
        if (pending.length < offset + 4 + length) return;
        scanned = Buffer.concat([
          scanned,
          pending.subarray(offset + 4, offset + 4 + length),
        ]);
        offset += 4 + length;
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing address");
  return { port: address.port, scanned: () => scanned };
}

function client(port: number, maximumSignatureAgeSeconds = 172_800) {
  return new ClamdInstreamClient(
    {
      clamdHost: "127.0.0.1",
      clamdPort: port,
      clamdTimeoutMs: 2_000,
      clamdMaximumResponseBytes: 8_192,
      maximumSignatureAgeSeconds,
    },
    () => now,
  );
}

async function* body() {
  yield Buffer.from("clamd ");
  yield Buffer.from("stream payload");
}

describe("ClamAV INSTREAM client", () => {
  it("maps only the exact OK response as clean and reports engine/signature data", async () => {
    const fake = await fakeClamd("stream: OK");
    await expect(client(fake.port).scan(body())).resolves.toEqual({
      result: "NO_THREATS_FOUND",
      engineVersion: "1.4.3",
      signatureVersion: "27899",
      signaturePublishedAt: now.toISOString(),
    });
    expect(fake.scanned().toString()).toBe("clamd stream payload");
  });

  it("maps an exact FOUND response as a threat", async () => {
    const fake = await fakeClamd("stream: Win.Test.EICAR_HDB-1 FOUND");
    await expect(client(fake.port).scan(body())).resolves.toMatchObject({
      result: "THREATS_FOUND",
    });
  });

  it("fails closed on malformed scan responses", async () => {
    const fake = await fakeClamd("stream: looks fine");
    await expect(client(fake.port).scan(body())).rejects.toThrow(
      "EVIDENCE_BROKER_CLAMD_SCAN_INVALID",
    );
  });

  it("fails readiness and scanning when signatures are stale", async () => {
    const fake = await fakeClamd("stream: OK", new Date(now.getTime() - 120_000));
    await expect(client(fake.port, 60).getVersion()).rejects.toThrow(
      "EVIDENCE_BROKER_CLAMD_SIGNATURE_STALE",
    );
    await expect(client(fake.port, 60).checkReadiness()).resolves.toMatchObject({
      status: "degraded",
      issueCodes: ["EVIDENCE_BROKER_CLAMD_SIGNATURE_STALE"],
    });
  });
});

