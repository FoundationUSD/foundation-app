import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getWaitlistProfileByUserId } from "@/lib/waitlist/profile";

export default async function AlphaRootPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/alpha/join");
  }

  const profile = await getWaitlistProfileByUserId(session.user.id);
  
  if (profile) {
    redirect("/alpha/welcome");
  } else {
    redirect("/alpha/join");
  }
}
