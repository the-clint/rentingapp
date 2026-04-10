import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

import { ResumeBanner } from "./resume-banner";

beforeEach(() => {
  replaceMock.mockReset();
});

describe("ResumeBanner", () => {
  it("renders the welcome-back copy", () => {
    render(
      <ResumeBanner
        pathname="/book/listing-1/contract"
        preservedQuery="start=2026-05-01&end=2026-05-03"
      />,
    );
    expect(screen.getByTestId("resume-banner")).toHaveTextContent(
      /Welcome back/,
    );
  });

  it("replaces the URL without `resumed=1` on dismiss", () => {
    render(
      <ResumeBanner
        pathname="/book/listing-1/contract"
        preservedQuery="start=2026-05-01&end=2026-05-03"
      />,
    );
    fireEvent.click(screen.getByTestId("resume-banner-dismiss"));
    expect(replaceMock).toHaveBeenCalledWith(
      "/book/listing-1/contract?start=2026-05-01&end=2026-05-03",
    );
  });

  it("replaces to bare pathname when no query is preserved", () => {
    render(<ResumeBanner pathname="/book/listing-1/payment" />);
    fireEvent.click(screen.getByTestId("resume-banner-dismiss"));
    expect(replaceMock).toHaveBeenCalledWith("/book/listing-1/payment");
  });

  it("hides itself after dismiss", () => {
    render(
      <ResumeBanner
        pathname="/book/listing-1/contract"
        preservedQuery="start=a&end=b"
      />,
    );
    fireEvent.click(screen.getByTestId("resume-banner-dismiss"));
    expect(screen.queryByTestId("resume-banner")).toBeNull();
  });
});
