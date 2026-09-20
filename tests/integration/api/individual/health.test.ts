/** @jest-environment node */

import { NextRequest } from "next/server";
import { countUsers } from "@/lib/user-store";
import * as routeModule from "@/app/api/health/route";

jest.mock("@/lib/user-store", () => ({
  countUsers: jest.fn(),
}));

const params = {};
const _payload = {
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

describe("src/app/api/health/route.ts", () => {
  it("GET returns an HTTP response object", async () => {
    (countUsers as jest.Mock).mockResolvedValue(1);

    const handler = routeModule.GET;
    const request = new NextRequest(
      "http://localhost/api/health?take=10&page=1",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: undefined,
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
