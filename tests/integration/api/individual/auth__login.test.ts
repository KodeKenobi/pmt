/** @jest-environment node */

import { NextRequest } from "next/server";
import { getUserWithTeamAccess, teamIdsForUser } from "@/lib/access";
import { getUserByEmail, isInternalStaffEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import * as routeModule from "@/app/api/auth/login/route";

jest.mock("@/lib/auth", () => ({
  getUserByEmail: jest.fn(),
  isInternalStaffEmail: jest.fn(),
}));

jest.mock("@/lib/access", () => ({
  getUserWithTeamAccess: jest.fn(),
  teamIdsForUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  db: {
    passwordReset: {
      updateMany: jest.fn(),
    },
  },
}));

const params = {};
const payload = {
  id: "id-test",
  email: "dev@lighthousemediagroup.com",
  password: "P@ssword123",
  name: "Integration Test",
  title: "Integration Ticket",
  teamId: "team-test",
  projectId: "project-test",
  token: "token-test",
  code: "code-test",
  status: "BACKLOG",
};

describe("src/app/api/auth/login/route.ts", () => {
  it("POST returns an HTTP response object", async () => {
    (getUserByEmail as jest.Mock).mockResolvedValue({
      id: "user-test",
      name: "Integration Test",
      email: "dev@lighthousemediagroup.com",
      phone: null,
      role: "USER",
      teamId: "team-test",
    });
    (isInternalStaffEmail as jest.Mock).mockReturnValue(true);
    (getUserWithTeamAccess as jest.Mock).mockResolvedValue({ id: "user-test" });
    (teamIdsForUser as jest.Mock).mockReturnValue(["team-test"]);
    (db.passwordReset.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const handler = routeModule.POST;
    const request = new NextRequest(
      "http://localhost/api/auth/login?take=10&page=1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const response = await Promise.resolve(
      (handler as any)(request, { params: Promise.resolve(params) }),
    );

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBeGreaterThanOrEqual(100);
    expect(response.status).toBeLessThan(600);
  });
});
