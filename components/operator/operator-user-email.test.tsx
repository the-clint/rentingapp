import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockState: { email: string | null } = { email: "owner@example.com" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: mockState.email ? { id: "u-1", email: mockState.email } : null,
        },
        error: null,
      })),
    },
  })),
}));

import { OperatorUserEmail } from "./operator-user-email";

async function renderAsync(element: React.ReactNode) {
  const resolved = await (element as unknown as Promise<React.ReactElement>);
  return render(resolved);
}

describe("OperatorUserEmail", () => {
  beforeEach(() => {
    mockState.email = "owner@example.com";
  });

  it("renders the current operator's email", async () => {
    await renderAsync(OperatorUserEmail());
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });

  it("renders nothing when there is no authenticated user", async () => {
    mockState.email = null;
    const { container } = await renderAsync(OperatorUserEmail());
    expect(container.firstChild).toBeNull();
  });
});
