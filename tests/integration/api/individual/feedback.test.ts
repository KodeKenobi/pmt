/** @jest-environment node */

import { NextRequest } from "next/server";
import * as routeModule from "@/app/api/feedback/route";

describe("src/app/api/feedback/route.ts", () => {
  it("GET returns an HTTP response object", async () => {
    const request = new NextRequest(
      "http://localhost/api/feedback?status=NEW",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await Promise.resolve(routeModule.GET(request));
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBeGreaterThanOrEqual(100);
    expect(response.status).toBeLessThan(600);
  });

  it("POST returns an HTTP response object", async () => {
    const request = new NextRequest("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromEmail: "dev@lighthousemediagroup.com",
        subject: "Client Feedback",
        message: "Please review attached files",
      }),
    });

    const response = await Promise.resolve(routeModule.POST(request));
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBeGreaterThanOrEqual(100);
    expect(response.status).toBeLessThan(600);
  });
});
