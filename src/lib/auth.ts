import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

export async function verifyAuth(): Promise<{ userId: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) throw new Error("Unauthorized");

  try {
    const { userId } = await verifySession(token);
    return { userId };
  } catch {
    throw new Error("Unauthorized");
  }
}
