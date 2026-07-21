import { NextResponse, type NextRequest } from "next/server";
import { downloadControlledEvidenceAttachment } from "@/server/services/attachments";

function contentDispositionFilename(filename: string) {
  return filename.replace(/["\\\r\n]/g, "_");
}

function encodedContentDisposition(filename: string) {
  const sanitized = contentDispositionFilename(filename);
  const fallback = sanitized.replace(
    /[^\x20-\x7e]/g,
    "_",
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
    sanitized,
  ).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )}`;
}

function webStream(body: AsyncIterable<Uint8Array>) {
  const iterator = body[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const download = await downloadControlledEvidenceAttachment({
      controlledEvidenceAttachmentId: id,
    });

    return new Response(webStream(download.body), {
      headers: {
        "Content-Disposition": encodedContentDisposition(
          download.originalFilename,
        ),
        "Content-Length": String(download.sizeBytes),
        "Content-Type": download.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE" },
      {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
