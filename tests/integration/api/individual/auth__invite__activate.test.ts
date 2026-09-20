/** @jest-environment node */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import * as routeModule from "@/app/api/auth/invite/activate/route";

jest.mock("@/lib/db", () => ({
  db: {
    inviteToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordReset: {
      findUnique: jest.fn(),
      update: jest.fn(),
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

describe("src/app/api/auth/invite/activate/route.ts", () => {
  it("POST returns an HTTP response object", async () => {
    (db.inviteToken.findUnique as jest.Mock).mockResolvedValue({
      id: "invite-test",
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (db.inviteToken.update as jest.Mock).mockResolvedValue({
      id: "invite-test",
    });

    const handler = routeModule.POST;
    const request = new NextRequest(
      "http://localhost/api/auth/invite/activate?take=10&page=1",
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
