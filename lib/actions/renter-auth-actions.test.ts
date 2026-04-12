import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockState = {
  recentRows: Array<{ id: string; created_at: string }>;
  recentError: { message: string } | null;
  insertError: { message: string } | null;
  signInWithOtpError: { message: string } | null;
  verifyOtpResult: {
    data: { user: { id: string; app_metadata: Record<string, unknown> } | null };
    error: { message: string } | null;
  };
  updateUserError: { message: string } | null;
  updatedUser: { id: string; metadata: Record<string, unknown> } | null;
  insertedRows: Record<string, unknown>[];
};

const mockState: MockState = {
  recentRows: [],
  recentError: null,
  insertError: null,
  signInWithOtpError: null,
  verifyOtpResult: {
    data: { user: { id: "renter-1", app_metadata: {} } },
    error: null,
  },
  updateUserError: null,
  updatedUser: null,
  insertedRows: [],
};

const signInWithOtp = vi.fn(async () => ({
  data: {},
  error: mockState.signInWithOtpError,
}));

const updateUserById = vi.fn(
  async (id: string, attrs: { app_metadata?: Record<string, unknown> }) => {
    mockState.updatedUser = {
      id,
      metadata: attrs.app_metadata ?? {},
    };
    return { data: { user: null }, error: mockState.updateUserError };
  },
);

// Admin client `.from("otp_attempts").select(...).eq(...).gte(...).limit(...)`
const limitMock = vi.fn(async () => ({
  data: mockState.recentRows,
  error: mockState.recentError,
}));
const gteMock = vi.fn(() => ({ limit: limitMock }));
const eqMock = vi.fn(() => ({ gte: gteMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));

const insertMock = vi.fn(async (row: Record<string, unknown>) => {
  mockState.insertedRows.push(row);
  return { data: null, error: mockState.insertError };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      signInWithOtp,
      admin: { updateUserById },
    },
    from: vi.fn((table: string) => {
      if (table === "otp_attempts") {
        return { select: selectMock, insert: insertMock };
      }
      throw new Error(`Unexpected admin table: ${table}`);
    }),
  })),
}));

const verifyOtp = vi.fn(async () => mockState.verifyOtpResult);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { verifyOtp },
  })),
}));

import { requestRenterOtp, verifyRenterOtp } from "./renter-auth-actions";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

describe("requestRenterOtp", () => {
  beforeEach(() => {
    mockState.recentRows = [];
    mockState.recentError = null;
    mockState.insertError = null;
    mockState.signInWithOtpError = null;
    mockState.insertedRows = [];
    signInWithOtp.mockClear();
    limitMock.mockClear();
    gteMock.mockClear();
    eqMock.mockClear();
    selectMock.mockClear();
    insertMock.mockClear();
  });

  afterEach(() => vi.useRealTimers());

  it("rejects an invalid phone number", async () => {
    const result = await requestRenterOtp(fd({ phone: "nope" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OTP_INVALID_PHONE");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("returns OTP_RATE_LIMITED when a recent attempt exists", async () => {
    mockState.recentRows = [
      { id: "row-1", created_at: new Date().toISOString() },
    ];
    const result = await requestRenterOtp(fd({ phone: "(801) 555-1234" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OTP_RATE_LIMITED");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends the OTP, normalizes phone, and records the attempt", async () => {
    const result = await requestRenterOtp(fd({ phone: "(801) 555-1234" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+18015551234");
    expect(signInWithOtp).toHaveBeenCalledWith({ phone: "+18015551234" });
    expect(insertMock).toHaveBeenCalledWith({ phone: "+18015551234" });
  });

  it("returns OTP_SEND_FAILED when Supabase sign-in errors", async () => {
    mockState.signInWithOtpError = { message: "Twilio unreachable" };
    const result = await requestRenterOtp(fd({ phone: "8015551234" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OTP_SEND_FAILED");
  });

  it("returns OTP_SEND_FAILED when rate-limit probe errors", async () => {
    mockState.recentError = { message: "db offline" };
    const result = await requestRenterOtp(fd({ phone: "8015551234" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OTP_SEND_FAILED");
  });
});

describe("verifyRenterOtp", () => {
  beforeEach(() => {
    mockState.verifyOtpResult = {
      data: { user: { id: "renter-1", app_metadata: {} } },
      error: null,
    };
    mockState.updateUserError = null;
    mockState.updatedUser = null;
    verifyOtp.mockClear();
    updateUserById.mockClear();
  });

  it("rejects an invalid code", async () => {
    const result = await verifyRenterOtp(
      fd({ phone: "(801) 555-1234", code: "abc" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OTP_INVALID_INPUT");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("verifies a valid OTP and stamps app_metadata.role='renter'", async () => {
    const result = await verifyRenterOtp(
      fd({ phone: "(801) 555-1234", code: "123456" }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.userId).toBe("renter-1");
    expect(verifyOtp).toHaveBeenCalledWith({
      phone: "+18015551234",
      token: "123456",
      type: "sms",
    });
    expect(updateUserById).toHaveBeenCalledWith("renter-1", {
      app_metadata: { role: "renter" },
    });
  });

  it("skips the metadata write when role is already 'renter'", async () => {
    mockState.verifyOtpResult = {
      data: { user: { id: "renter-1", app_metadata: { role: "renter" } } },
      error: null,
    };
    const result = await verifyRenterOtp(
      fd({ phone: "8015551234", code: "123456" }),
    );
    expect(result.success).toBe(true);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("returns OTP_INVALID_CODE when Supabase verify errors", async () => {
    mockState.verifyOtpResult = {
      data: { user: null },
      error: { message: "Token has expired or is invalid" },
    };
    const result = await verifyRenterOtp(
      fd({ phone: "8015551234", code: "999999" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OTP_INVALID_CODE");
  });
});
