import { renderModulePreview } from "@/server/mockups/renderModulePreview";

export const dynamic = "force-dynamic";

export default function GeneralLedgerPreviewPage() {
  return renderModulePreview("generalLedger");
}
