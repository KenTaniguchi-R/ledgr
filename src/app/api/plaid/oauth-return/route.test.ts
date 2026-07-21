import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/plaid/oauth-return", () => {
  it("does not interpolate request.url into the script", async () => {
    // GET takes no request parameter: the response is static and never
    // echoes any part of the incoming request (query string, headers, etc.)
    // into the inline <script>, which is what closed the XSS surface —
    // JSON.stringify does not escape `/`, so a raw request.url containing a
    // literal `</script>` could previously break out of the script tag.
    const res = GET();
    const body = await res.text();
    expect(body).not.toContain("</script><script>alert(1)");
    expect(body).toContain("window.location.href");
  });
});
