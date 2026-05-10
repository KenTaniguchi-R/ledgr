import { NextResponse } from "next/server";
import { verifyWebhookSignature, WebhookVerificationError } from "@/lib/plaid/webhook-verify";
import { dispatchWebhook } from "@/lib/plaid/webhook-handlers";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verificationHeader = request.headers.get("Plaid-Verification");

  if (!verificationHeader) {
    return NextResponse.json({ status: "ok" });
  }

  try {
    const payload = await verifyWebhookSignature(rawBody, verificationHeader);
    await dispatchWebhook(payload);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }
    return NextResponse.json({ status: "ok" });
  }
}
