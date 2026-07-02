import { renderModulePreview } from "@/server/mockups/renderModulePreview";

export const dynamic = "force-dynamic";

export default function BankCashPreviewPage() {
  return renderModulePreview("bankCash");
}
