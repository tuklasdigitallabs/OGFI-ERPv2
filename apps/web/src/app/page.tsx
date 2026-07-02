import { redirect } from "next/navigation";
import { getDefaultAppRoute } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";

export default async function HomePage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  redirect(getDefaultAppRoute(session.permissionCodes));
}
