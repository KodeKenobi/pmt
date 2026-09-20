/** @jest-environment node */

import { NextRequest } from "next/server";

jest.mock("@/lib/auth", () => ({
  hashPassword: jest.fn().mockResolvedValue("hashed-password"),
}));

jest.mock("@/lib/user-store", () => ({
  updateUser: jest.fn().mockResolvedValue({}),
}));

jest.mock("@/lib/db", () => ({
  db: {
    passwordReset: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
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

describe("src/app/api/auth/reset-password/route.ts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("POST returns an HTTP response object", async () => {
    const { db } = await import("@/lib/db");
    (db.passwordReset.findUnique as jest.Mock).mockResolvedValue({
      id: "pr-1",
      userId: "u-1",
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const routeModule = await import("@/app/api/auth/reset-password/route");
    const handler = routeModule.POST;
    const request = new NextRequest(
      "http://localhost/api/auth/reset-password?take=10&page=1",
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


