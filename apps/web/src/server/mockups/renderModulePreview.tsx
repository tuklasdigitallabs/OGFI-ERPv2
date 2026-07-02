import { ModulePreviewPage } from "@/components/ModulePreviewPage";
import { modulePreviews, type ModulePreviewKey } from "./modulePreviews";

export function renderModulePreview(key: ModulePreviewKey) {
  return <ModulePreviewPage config={modulePreviews[key]} />;
}
