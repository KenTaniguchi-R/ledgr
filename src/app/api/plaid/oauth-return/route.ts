import { NextResponse } from "next/server";

export function GET() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Connecting...</title></head>
      <body>
        <script>
          if (window.opener) {
            window.opener.postMessage(
              { type: "plaid-oauth-redirect", receivedRedirectUri: window.location.href },
              window.location.origin
            );
            window.close();
          } else {
            window.location.href = "/accounts";
          }
        </script>
        <p>Connecting your account... You can close this window.</p>
      </body>
    </html>
  `;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
