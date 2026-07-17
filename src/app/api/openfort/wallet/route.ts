/**
 * Returns info about Bottie's Openfort backend wallet (the AI treasury).
 * Used by the dashboard to display treasury status.
 */
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { OPENFORT_API } from "@/lib/openfort";

export async function GET() {
  try {
    await verifyAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const walletId = process.env.OPENFORT_BACKEND_WALLET_ID;
  const secretKey = process.env.OPENFORT_SECRET_KEY;

  if (!walletId || !secretKey) {
    return NextResponse.json({ configured: false });
  }

  const res = await fetch(`${OPENFORT_API}/v2/accounts/backend/${walletId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  if (!res.ok) {
    return NextResponse.json({ configured: false, error: "Wallet not found" });
  }

  const wallet = await res.json();

  return NextResponse.json({
    configured: true,
    id: wallet.id,
    address: wallet.address,
    chainType: wallet.chainType,
    createdAt: wallet.createdAt,
  });
}
