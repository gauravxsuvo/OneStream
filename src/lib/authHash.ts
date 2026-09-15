export const AUTH_COOKIE = "onestream_auth";

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Checks the passcode cookie directly, for routes that opt out of the
 * middleware/proxy gate (see src/app/api/upload/route.ts). Mirrors the check
 * middleware.ts does inline. */
export async function isAuthenticated(cookieValue: string | undefined): Promise<boolean> {
  const passcode = process.env.ONESTREAM_PASSCODE;
  if (!passcode) return true;
  if (!cookieValue) return false;
  return cookieValue === (await sha256Hex(passcode));
}
