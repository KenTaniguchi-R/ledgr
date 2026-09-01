import { describe, it, expect } from "vitest";
import {
  authErrorMessage,
  GENERIC_ERROR,
  SERVER_ERROR,
} from "./error-message";

describe("authErrorMessage", () => {
  const known = { USER_ALREADY_EXISTS: "An account with this email already exists." };

  it("prefers form-specific copy for a code it knows", () => {
    expect(
      authErrorMessage({ code: "USER_ALREADY_EXISTS", status: 422 }, known),
    ).toBe(known.USER_ALREADY_EXISTS);
  });

  // The #133 case: a 500 carrying no code used to render "please try again",
  // which is advice that can never work.
  it("names a 500 as a server-side problem and points at the logs", () => {
    expect(
      authErrorMessage({ status: 500, statusText: "Internal Server Error" }),
    ).toBe(SERVER_ERROR);
    expect(SERVER_ERROR).not.toBe(GENERIC_ERROR);
  });

  it("does not echo the server's message on a 5xx", () => {
    expect(
      authErrorMessage({
        status: 500,
        message: 'The field "issuer" does not exist in the "account" Drizzle schema',
      }),
    ).toBe(SERVER_ERROR);
  });

  it("surfaces a 4xx message, which Better Auth writes for end users", () => {
    expect(
      authErrorMessage({ status: 400, message: "Password is too short" }),
    ).toBe("Password is too short");
  });

  it("falls back to the generic message when there is nothing specific", () => {
    expect(authErrorMessage({ status: 400 })).toBe(GENERIC_ERROR);
    expect(authErrorMessage({})).toBe(GENERIC_ERROR);
    expect(authErrorMessage(null)).toBe(GENERIC_ERROR);
  });

  it("still maps a known code when it arrives on a 5xx", () => {
    expect(
      authErrorMessage({ code: "USER_ALREADY_EXISTS", status: 500 }, known),
    ).toBe(known.USER_ALREADY_EXISTS);
  });
});
