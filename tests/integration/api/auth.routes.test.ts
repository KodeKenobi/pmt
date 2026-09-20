/** @jest-environment node */

import { NextRequest } from "next/server";
import { GET as meGet } from "@/app/api/auth/me/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import {
  getUserByEmail,
  getUserFromRequest,
  isInternalStaffEmail,
} from "@/lib/auth";
import { getUserWithTeamAccess, teamIdsForUser } from "@/lib/access";

jest.mock("@/lib/auth", () => ({
  getUserByEmail: jest.fn(),
  getUserFromRequest: jest.fn(),
  isInternalStaffEmail: jest.fn(),
}));

jest.mock("@/lib/access", () => ({
  getUserWithTeamAccess: jest.fn(),
  teamIdsForUser: jest.fn(),
}));

jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(() => ({
    auth: { getUser: jest.fn() },
  })),
}));

jest.mock("@/lib/db", () => ({
  db: {
    passwordReset: {
      updateMany: jest.fn(),
    },
  },
}));

import { createSupabaseAdminClient } from "@/lib/supabase";

const createSupabaseAdminClientMock = createSupabaseAdminClient as jest.MockedFunction<
  typeof createSupabaseAdminClient
>;

const getUserByEmailMock = getUserByEmail as jest.MockedFunction<
  typeof getUserByEmail
>;
const getUserFromRequestMock = getUserFromRequest as jest.MockedFunction<
  typeof getUserFromRequest
>;
const isInternalStaffEmailMock = isInternalStaffEmail as jest.MockedFunction<
  typeof isInternalStaffEmail
>;
const getUserWithTeamAccessMock = getUserWithTeamAccess as jest.MockedFunction<
  typeof getUserWithTeamAccess
>;
const teamIdsForUserMock = teamIdsForUser as jest.MockedFunction<
  typeof teamIdsForUser
>;

describe("Auth routes", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("POST /api/auth/login returns 400 when access token is missing", async () => {
    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const response = await loginPost(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Access token is required/i);
  });

  it("POST /api/auth/login returns 401 when Supabase token is invalid", async () => {
    const supabaseMock = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("Invalid token"),
        }),
      },
    };
    createSupabaseAdminClientMock.mockReturnValue(supabaseMock as any);

    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ accessToken: "invalid-token" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await loginPost(request);

    expect(response.status).toBe(401);
  });

  it("POST /api/auth/login sets cookie and returns user payload on success", async () => {
    const baseUser = {
      id: "u-1",
      name: "Dev User",
      email: "dev@lighthousemediagroup.com",
      phone: null,
      role: "USER",
      teamId: "team-1",
    };

    const supabaseMock = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: { email: "dev@lighthousemediagroup.com" },
          },
          error: null,
        }),
      },
    };
    createSupabaseAdminClientMock.mockReturnValue(supabaseMock as any);

    getUserByEmailMock.mockResolvedValue(baseUser as any);
    isInternalStaffEmailMock.mockReturnValue(true);
    getUserWithTeamAccessMock.mockResolvedValue({
      ...baseUser,
      teamMemberships: [{ teamId: "team-1" }],
    } as any);
    teamIdsForUserMock.mockReturnValue(["team-1"]);

    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ accessToken: "valid-token" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await loginPost(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBe("dev@lighthousemediagroup.com");
    expect(response.headers.get("set-cookie") || "").toContain("userId=u-1");
  });

  it("GET /api/auth/me returns 401 when no session user", async () => {
    getUserFromRequestMock.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/auth/me", {
      method: "GET",
    });

    const response = await meGet(request);
    expect(response.status).toBe(401);
  });

  it("GET /api/auth/me returns user payload with team ids", async () => {
    getUserFromRequestMock.mockResolvedValue({
      id: "u-1",
      name: "Dev User",
      email: "dev@lighthousemediagroup.com",
      phone: null,
      role: "USER",
      teamId: "team-1",
    } as any);
    getUserWithTeamAccessMock.mockResolvedValue({
      id: "u-1",
      teamMemberships: [{ teamId: "team-1" }, { teamId: "team-2" }],
    } as any);
    teamIdsForUserMock.mockReturnValue(["team-1", "team-2"]);

    const request = new NextRequest("http://localhost/api/auth/me", {
      method: "GET",
    });

    const response = await meGet(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.teamIds).toEqual(["team-1", "team-2"]);
  });

  it("POST /api/auth/logout clears cookie", async () => {
    const response = await logoutPost();

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie") || "").toContain("Max-Age=0");
  });
});
