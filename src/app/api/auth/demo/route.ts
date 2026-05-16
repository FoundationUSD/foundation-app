import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { user, session, account, waitlistProfile } from "../../../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { upsertWaitlistProfileForUser } from "@/lib/waitlist/profile";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bypass = searchParams.get("bypass");

  if (bypass !== "true") {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 1. Ensure demo user exists
    let demoUser = await db.query.user.findFirst({
      where: eq(user.email, "demo@foundation.app"),
    });

    if (!demoUser) {
      const [newUser] = await db
        .insert(user)
        .values({
          id: "demo-user-id",
          name: "Demo User",
          email: "demo@foundation.app",
          emailVerified: true,
        })
        .returning();
      demoUser = newUser;
    }

    // 2. Ensure mock twitter account exists
    const [existingAccount] = await db
      .select()
      .from(account)
      .where(and(eq(account.userId, demoUser.id), eq(account.providerId, "twitter")))
      .limit(1);

    if (!existingAccount) {
      await db.insert(account).values({
        id: "demo-account-id-" + Date.now(),
        userId: demoUser.id,
        accountId: "demo-twitter-id",
        providerId: "twitter",
        accessToken: "demo-access-token",
      });
    }

    // 3. Ensure waitlist profile exists
    await upsertWaitlistProfileForUser(demoUser.id);

    // 4. Create a fresh session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const token = "demo-token-" + Math.random().toString(36).substring(7);

    const [newSession] = await db
      .insert(session)
      .values({
        id: "demo-session-id-" + Date.now(),
        userId: demoUser.id,
        token: token,
        expiresAt: expiresAt,
        ipAddress: "127.0.0.1",
        userAgent: "Demo Browser",
      })
      .returning();

    // 5. Set session cookie
    const cookieStore = await cookies();
    cookieStore.set("better-auth.session-token", newSession.token, {
      expires: expiresAt,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false, // Local dev
    });
  } catch (error) {
    console.error("Demo bypass error:", error);
    return new Response(
      `Demo bypass failed: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    );
  }

  redirect("/alpha/reveal?bypass=true");
}
