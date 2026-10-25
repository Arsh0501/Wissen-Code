import { describe, expect, it } from "vitest";
import { invitationPath } from "./CandidateWelcome";

describe("candidate invitation routing", () => {
  const origin = "https://hiring.example.com";
  it.each(["/invite/abc-123", "/interview/room_42"])(
    "opens a local invitation: %s",
    (path) => {
      expect(invitationPath(` ${origin}${path} `, origin)).toBe(path);
      expect(invitationPath(path, origin)).toBe(path);
    },
  );
  it.each([
    "https://unrelated.example/invite/abc",
    "//unrelated.example/interview/abc",
    "javascript:alert(1)",
    "/admin/team",
    "/invite/",
    "not an invitation",
    "https://hiring.example.com.unrelated.example/invite/abc",
  ])("rejects non-invitation destinations: %s", (value) => {
    expect(invitationPath(value, origin)).toBeNull();
  });
});
