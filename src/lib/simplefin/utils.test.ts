import { describe, it, expect } from "vitest";
import { classifyPollError } from "./utils";
import { SimplefinHttpError } from "./client";

describe("classifyPollError", () => {
  it("classifies a 403 from /accounts as revoked", () => {
    const result = classifyPollError(new SimplefinHttpError(403, "forbidden"));
    expect(result.status).toBe("revoked");
    expect(result.errorCode).toBe("ACCESS_REVOKED");
  });

  it("classifies a non-403 HTTP error as error, tagged with the status code", () => {
    const result = classifyPollError(new SimplefinHttpError(500, "server error"));
    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("HTTP_500");
    expect(result.message).toBe("server error");
  });

  it("classifies a generic Error as error with an unknown code", () => {
    const result = classifyPollError(new Error("network down"));
    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("UNKNOWN");
    expect(result.message).toBe("network down");
  });

  it("classifies a non-Error throw with a generic message", () => {
    const result = classifyPollError("some string throw");
    expect(result.status).toBe("error");
    expect(result.message).toBe("Unknown SimpleFIN sync error");
  });
});
