/** @jest-environment node */

import { NextRequest } from "next/server";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { createUser, findUserByEmail } from "@/lib/user-store";
import * as routeModule from "@/app/api/auth/invite/accept/route";

jest.mock("@/lib/db", () => ({
  db: {
    inviteToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth", () => ({
  hashPassword: jest.fn(),
}));

jest.mock("@/lib/user-store", () => ({
  createUser: jest.fn(),
  findUserByEmail: jest.fn(),
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

describe("src/app/api/auth/invite/accept/route.ts", () => {
  it("POST returns an HTTP response object", async () => {
    (db.inviteToken.findUnique as jest.Mock).mockResolvedValue({
      id: "invite-test",
      token: "token-test",
      email: "dev@lighthousemediagroup.com",
      role: "USER",
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (findUserByEmail as jest.Mock).mockResolvedValue(null);
    (hashPassword as jest.Mock).mockResolvedValue("hashed-password");
    (createUser as jest.Mock).mockResolvedValue({
      id: "user-test",
      email: "dev@lighthousemediagroup.com",
      name: "Integration Test",
      role: "USER",
    });
    (db.inviteToken.update as jest.Mock).mockResolvedValue({
      id: "invite-test",
    });

    const handler = routeModule.POST;
    const request = new NextRequest(
      "http://localhost/api/auth/invite/accept?take=10&page=1",
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
