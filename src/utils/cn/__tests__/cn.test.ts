import { describe, expect, it } from "vitest";
import { cn } from "../cn";

describe("cn", () => {
  it("joins truthy class names and drops falsy ones", () => {
    const showB: boolean = false;
    expect(cn("a", showB && "b", undefined, "c")).toBe("a c");
  });

  it("resolves conflicting Tailwind utilities, keeping the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("merges conditional object syntax", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });
});
