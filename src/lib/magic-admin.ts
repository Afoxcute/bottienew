import { Magic as MagicAdmin } from "@magic-sdk/admin";

let admin: MagicAdmin | null = null;

export function getMagicAdmin(): MagicAdmin {
  if (!admin) {
    const secretKey = process.env.MAGIC_SECRET_KEY;
    if (!secretKey) throw new Error("MAGIC_SECRET_KEY is not set");
    admin = new MagicAdmin(secretKey);
  }
  return admin;
}
