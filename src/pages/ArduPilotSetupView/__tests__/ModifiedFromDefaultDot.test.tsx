import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useMavlinkParamDefaultsStore } from "../../../stores/mavlinkParamDefaultsStore/mavlinkParamDefaultsStore";
import { ModifiedFromDefaultDot } from "../ModifiedFromDefaultDot";

afterEach(() => {
  useMavlinkParamDefaultsStore.getState().reset();
});

describe("ModifiedFromDefaultDot", () => {
  it("renders nothing when no defaults have been downloaded yet", () => {
    const { container } = render(<ModifiedFromDefaultDot name="ATC_RAT_RLL_P" value={0.25} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when this param isn't in the downloaded defaults", () => {
    useMavlinkParamDefaultsStore.getState().setDone({ SOME_OTHER_PARAM: 1 });
    const { container } = render(<ModifiedFromDefaultDot name="ATC_RAT_RLL_P" value={0.25} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the value matches its default", () => {
    useMavlinkParamDefaultsStore.getState().setDone({ ATC_RAT_RLL_P: 0.135 });
    const { container } = render(<ModifiedFromDefaultDot name="ATC_RAT_RLL_P" value={0.135} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a marker when the value differs from its downloaded default", () => {
    useMavlinkParamDefaultsStore.getState().setDone({ ATC_RAT_RLL_P: 0.135 });
    render(<ModifiedFromDefaultDot name="ATC_RAT_RLL_P" value={0.25} />);
    expect(screen.getByLabelText("Змінено від стандартного (0.135)")).toBeInTheDocument();
  });
});
