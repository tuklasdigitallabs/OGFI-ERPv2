import net from "node:net";
import { once } from "node:events";
import { EvidenceBrokerError } from "./errors";
import type {
  BrokerScanResult,
  BrokerStorageReadiness,
  EvidenceBrokerConfig,
} from "./types";

type ClamdVersion = {
  engineVersion: string;
  signatureVersion: string;
  signaturePublishedAt: string;
};

async function writeSocket(socket: net.Socket, chunk: Uint8Array) {
  if (!socket.write(chunk)) await once(socket, "drain");
}

export class ClamdInstreamClient {
  constructor(
    private readonly config: Pick<
      EvidenceBrokerConfig,
      | "clamdHost"
      | "clamdPort"
      | "clamdTimeoutMs"
      | "clamdMaximumResponseBytes"
      | "maximumSignatureAgeSeconds"
    >,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async connect() {
    const socket = net.createConnection({
      host: this.config.clamdHost,
      port: this.config.clamdPort,
    });
    socket.setTimeout(this.config.clamdTimeoutMs, () => {
      socket.destroy(new Error("clamd timeout"));
    });
    try {
      await once(socket, "connect");
      return socket;
    } catch {
      socket.destroy();
      throw new EvidenceBrokerError(503, "EVIDENCE_BROKER_CLAMD_UNAVAILABLE");
    }
  }

  private async readResponse(socket: net.Socket) {
    const chunks: Buffer[] = [];
    let size = 0;
    let terminated = false;
    try {
      for await (const raw of socket) {
        const chunk = Buffer.from(raw);
        const nul = chunk.indexOf(0);
        if (nul >= 0 && nul !== chunk.byteLength - 1) {
          throw new EvidenceBrokerError(502, "EVIDENCE_BROKER_CLAMD_RESPONSE_INVALID");
        }
        const accepted = nul >= 0 ? chunk.subarray(0, nul) : chunk;
        size += accepted.byteLength;
        if (size > this.config.clamdMaximumResponseBytes) {
          throw new EvidenceBrokerError(
            502,
            "EVIDENCE_BROKER_CLAMD_RESPONSE_TOO_LARGE",
          );
        }
        chunks.push(accepted);
        if (nul >= 0) {
          terminated = true;
          break;
        }
      }
    } catch (error) {
      if (error instanceof EvidenceBrokerError) throw error;
      throw new EvidenceBrokerError(503, "EVIDENCE_BROKER_CLAMD_UNAVAILABLE");
    } finally {
      socket.destroy();
    }
    const response = Buffer.concat(chunks).toString("utf8");
    if (
      !terminated ||
      !response ||
      response.includes("\0") ||
      response.includes("\r") ||
      response.includes("\n")
    ) {
      throw new EvidenceBrokerError(502, "EVIDENCE_BROKER_CLAMD_RESPONSE_INVALID");
    }
    return response;
  }

  async getVersion(): Promise<ClamdVersion> {
    const socket = await this.connect();
    try {
      await writeSocket(socket, Buffer.from("zVERSION\0", "ascii"));
    } catch {
      socket.destroy();
      throw new EvidenceBrokerError(503, "EVIDENCE_BROKER_CLAMD_UNAVAILABLE");
    }
    const response = await this.readResponse(socket);
    const match = /^ClamAV ([^/\s]+)\/([0-9]+)\/(.+)$/.exec(response);
    if (!match?.[1] || !match[2] || !match[3]) {
      throw new EvidenceBrokerError(502, "EVIDENCE_BROKER_CLAMD_VERSION_INVALID");
    }
    const published = new Date(match[3]);
    if (!Number.isFinite(published.getTime())) {
      throw new EvidenceBrokerError(502, "EVIDENCE_BROKER_CLAMD_VERSION_INVALID");
    }
    const ageMs = this.now().getTime() - published.getTime();
    if (
      ageMs < -300_000 ||
      ageMs > this.config.maximumSignatureAgeSeconds * 1000
    ) {
      throw new EvidenceBrokerError(503, "EVIDENCE_BROKER_CLAMD_SIGNATURE_STALE");
    }
    return {
      engineVersion: match[1],
      signatureVersion: match[2],
      signaturePublishedAt: published.toISOString(),
    };
  }

  private async instream(body: AsyncIterable<Uint8Array>) {
    const socket = await this.connect();
    try {
      await writeSocket(socket, Buffer.from("zINSTREAM\0", "ascii"));
      for await (const raw of body) {
        const chunk = Buffer.from(raw);
        for (let offset = 0; offset < chunk.byteLength; offset += 1024 * 1024) {
          const part = chunk.subarray(offset, offset + 1024 * 1024);
          const length = Buffer.alloc(4);
          length.writeUInt32BE(part.byteLength);
          await writeSocket(socket, length);
          await writeSocket(socket, part);
        }
      }
      await writeSocket(socket, Buffer.alloc(4));
    } catch {
      socket.destroy();
      throw new EvidenceBrokerError(503, "EVIDENCE_BROKER_CLAMD_UNAVAILABLE");
    }
    return this.readResponse(socket);
  }

  async scan(body: AsyncIterable<Uint8Array>): Promise<BrokerScanResult> {
    const version = await this.getVersion();
    const response = await this.instream(body);
    if (response === "stream: OK") {
      return { result: "NO_THREATS_FOUND", ...version };
    }
    if (/^stream: [^\n]+ FOUND$/.test(response)) {
      return { result: "THREATS_FOUND", ...version };
    }
    throw new EvidenceBrokerError(502, "EVIDENCE_BROKER_CLAMD_SCAN_INVALID");
  }

  async checkReadiness(): Promise<BrokerStorageReadiness> {
    try {
      await this.getVersion();
      return {
        status: "ok",
        checks: { clamd: "ok", signaturesCurrent: "ok" },
        issueCodes: [],
      };
    } catch (error) {
      const code =
        error instanceof EvidenceBrokerError
          ? error.code
          : "EVIDENCE_BROKER_CLAMD_UNAVAILABLE";
      return {
        status: "degraded",
        checks: { clamd: "failed", signaturesCurrent: "failed" },
        issueCodes: [code],
      };
    }
  }
}
