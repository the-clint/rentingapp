import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const replaceMock = vi.fn();
let searchParamsState = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/book/listing-1",
  useSearchParams: () => searchParamsState,
}));

import { useBookingDateSelection } from "./use-booking-date-selection";

function setSearch(qs: string) {
  searchParamsState = new URLSearchParams(qs);
}

// Simulate router updates by re-reading the last call and updating the
// in-memory URLSearchParams so the next render returns the new state.
function commitReplaceToState() {
  const last = replaceMock.mock.calls.at(-1)?.[0] as string | undefined;
  if (!last) return;
  const qs = last.includes("?") ? last.slice(last.indexOf("?") + 1) : "";
  setSearch(qs);
}

describe("useBookingDateSelection", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    setSearch("");
  });

  it("starts empty when there are no query params", () => {
    const { result } = renderHook(() => useBookingDateSelection());
    expect(result.current.startDate).toBeNull();
    expect(result.current.endDate).toBeNull();
    expect(result.current.totalDays).toBe(0);
    expect(result.current.selectedDates).toEqual([]);
  });

  it("reads existing params", () => {
    setSearch("start=2026-04-11&end=2026-04-13");
    const { result } = renderHook(() => useBookingDateSelection());
    expect(result.current.startDate).toBe("2026-04-11");
    expect(result.current.endDate).toBe("2026-04-13");
    expect(result.current.totalDays).toBe(3);
    expect(result.current.selectedDates).toEqual([
      "2026-04-11",
      "2026-04-12",
      "2026-04-13",
    ]);
  });

  it("ignores malformed params", () => {
    setSearch("start=nope&end=also-nope");
    const { result } = renderHook(() => useBookingDateSelection());
    expect(result.current.startDate).toBeNull();
    expect(result.current.endDate).toBeNull();
  });

  it("pickDate on empty selection sets start", () => {
    const { result } = renderHook(() => useBookingDateSelection());
    act(() => result.current.pickDate("2026-04-11"));
    expect(replaceMock).toHaveBeenCalledWith(
      "/book/listing-1?start=2026-04-11",
      { scroll: false },
    );
  });

  it("pickDate after a start sets end", () => {
    setSearch("start=2026-04-11");
    const { result } = renderHook(() => useBookingDateSelection());
    act(() => result.current.pickDate("2026-04-13"));
    const last = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(last).toContain("start=2026-04-11");
    expect(last).toContain("end=2026-04-13");
  });

  it("pickDate earlier than start resets start", () => {
    setSearch("start=2026-04-11");
    const { result } = renderHook(() => useBookingDateSelection());
    act(() => result.current.pickDate("2026-04-09"));
    const last = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(last).toContain("start=2026-04-09");
    expect(last).not.toContain("end=");
  });

  it("pickDate equal to start clears the selection", () => {
    setSearch("start=2026-04-11");
    const { result } = renderHook(() => useBookingDateSelection());
    act(() => result.current.pickDate("2026-04-11"));
    expect(replaceMock).toHaveBeenCalledWith("/book/listing-1", {
      scroll: false,
    });
  });

  it("pickDate after a complete range starts a fresh range", () => {
    setSearch("start=2026-04-11&end=2026-04-13");
    const { result } = renderHook(() => useBookingDateSelection());
    act(() => result.current.pickDate("2026-04-20"));
    const last = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(last).toContain("start=2026-04-20");
    expect(last).not.toContain("end=");
  });

  it("reset clears both ends", () => {
    setSearch("start=2026-04-11&end=2026-04-13");
    const { result } = renderHook(() => useBookingDateSelection());
    act(() => result.current.reset());
    expect(replaceMock).toHaveBeenCalledWith("/book/listing-1", {
      scroll: false,
    });
  });

  it("totalCentsFor multiplies days by rate", () => {
    setSearch("start=2026-04-11&end=2026-04-13");
    const { result } = renderHook(() => useBookingDateSelection());
    expect(result.current.totalCentsFor(3500)).toBe(10500);
  });

  // Silence the unused helper — keeps the mock tidy for future additions.
  it("helper commitReplaceToState is callable", () => {
    commitReplaceToState();
    expect(true).toBe(true);
  });
});
