import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { simulateTxServer } from "@/lib/sim-server";

export async function POST() {
  try {
    await verifyAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const txHash = await simulateTxServer();
  return NextResponse.json({ txHash });
}
