import { err, ok, type Result } from "@/lib/utils/result";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

export async function verifyTurnstileToken(
  token: string,
): Promise<Result<null>> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.log("[turnstile] TURNSTILE_SECRET_KEY not set — stubbing verification as pass");
    return ok(null);
  }

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    },
  );

  if (!res.ok) {
    return err("CAPTCHA_FAILED", "Turnstile verification request failed");
  }

  const data = (await res.json()) as TurnstileVerifyResponse;
  if (!data.success) {
    const codes = data["error-codes"]?.join(", ") ?? "unknown";
    return err("CAPTCHA_FAILED", `Turnstile rejected: ${codes}`);
  }

  return ok(null);
}
