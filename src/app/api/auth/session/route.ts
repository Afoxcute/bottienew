import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getMagicAdmin } from "@/lib/magic-admin";
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";

export async function POST(req: Request) {
  let didToken: string | undefined;
  try {
    const body = await req.json();
    didToken = body?.didToken;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!didToken) {
    return NextResponse.json({ error: "Missing didToken" }, { status: 400 });
  }

  try {
    const magicAdmin = getMagicAdmin();
    magicAdmin.token.validate(didToken);
    const metadata = await magicAdmin.users.getMetadataByToken(didToken);
    if (!metadata.publicAddress) {
      return NextResponse.json({ error: "No wallet address on Magic user" }, { status: 401 });
    }

    const sessionToken = await signSession({
      userId: metadata.publicAddress,
      email: metadata.email ?? undefined,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    });

    return NextResponse.json({ ok: true, address: metadata.publicAddress });
  } catch (err) {
    console.error("[auth/session] Magic token validation failed:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
