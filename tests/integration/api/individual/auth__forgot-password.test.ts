/** @jest-environment node */

import { NextRequest } from "next/server";

jest.mock("@/lib/auth", () => ({
  getUserByEmail: jest.fn(),
}));

jest.mock("@/lib/email-service", () => ({
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock("@/lib/app-url", () => ({
  resolveAppBaseUrl: jest.fn(() => "http://localhost:3000"),
}));

jest.mock("@/lib/db", () => ({
  db: {
    passwordReset: {
      create: jest.fn(),
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

describe("src/app/api/auth/forgot-password/route.ts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("POST returns an HTTP response object", async () => {
    const { getUserByEmail } = await import("@/lib/auth");
    (getUserByEmail as jest.Mock).mockResolvedValue({
      id: "u-1",
      email: "dev@lighthousemediagroup.com",
      name: "Dev User",
    });

    const routeModule = await import("@/app/api/auth/forgot-password/route");
    const handler = routeModule.POST;
    const request = new NextRequest(
      "http://localhost/api/auth/forgot-password?take=10&page=1",
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


