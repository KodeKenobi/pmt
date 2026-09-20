/** @jest-environment node */

import { NextRequest } from "next/server";
import * as routeModule from "@/app/api/analytics/executive/route";

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

describe("src/app/api/analytics/executive/route.ts", () => {
  it("GET returns an HTTP response object", async () => {
    const handler = routeModule.GET;
    const request = new NextRequest(
      "http://localhost/api/analytics/executive?take=10&page=1",
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
