import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getWaitlistProfileByUserId } from "@/lib/waitlist/profile";
import { JoinClient } from "./JoinClient";

export default async function JoinWaitlistPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    const profile = await getWaitlistProfileByUserId(session.user.id);
    if (profile) {
      // User is already onboarded, send them to their dashboard
      redirect("/alpha/welcome");
    }
  }

  return <JoinClient />;
}
