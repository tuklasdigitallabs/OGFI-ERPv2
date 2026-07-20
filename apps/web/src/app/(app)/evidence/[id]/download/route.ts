import { NextResponse, type NextRequest } from "next/server";
import { downloadControlledEvidenceAttachment } from "@/server/services/attachments";

function contentDispositionFilename(filename: string) {
  return filename.replace(/["\\\r\n]/g, "_");
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

    return new Response(new Uint8Array(download.buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="${contentDispositionFilename(
          download.originalFilename,
        )}"`,
        "Content-Length": String(download.sizeBytes),
        "Content-Type": download.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE" },
      { status: 404 },
    );
  }
}
