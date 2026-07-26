import { describe, expect, it } from "vitest";
import { ADVISORS, runAdvisors } from "../registry";
import type { Advisor, Finding } from "../../types";
import type { Flight } from "../../../../types";

const EMPTY_FLIGHT: Flight = { board: "1", timeReliable: true, fmt: "skylog", samples: [{ t: 0 }] };

describe("runAdvisors", () => {
  it("flattens findings from every registered advisor by default", () => {
    const alwaysOne: Advisor = (): Finding[] => [{ id: "a", severity: "info", message: "one" }];
    const alwaysTwo: Advisor = (): Finding[] => [
      { id: "b", severity: "info", message: "two" },
      { id: "c", severity: "info", message: "three" },
    ];
    expect(runAdvisors(EMPTY_FLIGHT, [alwaysOne, alwaysTwo])).toHaveLength(3);
  });

  it("runs the default ADVISORS registry without throwing on a clean flight", () => {
    expect(() => runAdvisors(EMPTY_FLIGHT)).not.toThrow();
    expect(runAdvisors(EMPTY_FLIGHT)).toEqual([]);
  });

  it("keeps at least the built-in advisors registered", () => {
    expect(ADVISORS.length).toBeGreaterThanOrEqual(2);
  });
});
