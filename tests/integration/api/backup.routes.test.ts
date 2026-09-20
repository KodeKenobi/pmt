/** @jest-environment node */

import { NextRequest } from "next/server";
import * as backupExportRoute from "@/app/api/settings/backup/route";
import * as backupHistoryRoute from "@/app/api/settings/backups/route";
import * as backupDetailRoute from "@/app/api/settings/backups/[id]/route";
import { getUserFromRequest } from "@/lib/auth";
import {
  createAndStoreBackupSnapshot,
  listBackupRecords,
  loadBackupRecordById,
  restoreBackupSnapshot,
} from "@/lib/backup";

jest.mock("@/lib/auth", () => ({
  getUserFromRequest: jest.fn(),
}));

jest.mock("@/lib/backup", () => ({
  createAndStoreBackupSnapshot: jest.fn(),
  listBackupRecords: jest.fn(),
  loadBackupRecordById: jest.fn(),
  restoreBackupSnapshot: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  db: {
    backupSnapshot: {
      update: jest.fn(),
    },
  },
}));

const getUserFromRequestMock = getUserFromRequest as jest.MockedFunction<
  typeof getUserFromRequest
>;
const createAndStoreBackupSnapshotMock =
  createAndStoreBackupSnapshot as jest.MockedFunction<
    typeof createAndStoreBackupSnapshot
  >;
const listBackupRecordsMock = listBackupRecords as jest.MockedFunction<
  typeof listBackupRecords
>;
const loadBackupRecordByIdMock = loadBackupRecordById as jest.MockedFunction<
  typeof loadBackupRecordById
>;
const restoreBackupSnapshotMock = restoreBackupSnapshot as jest.MockedFunction<
  typeof restoreBackupSnapshot
>;

describe("Backup routes", () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.BACKUP_SCHEDULE_SECRET;
  });

  it("GET /api/settings/backup returns 401 when not authenticated", async () => {
    getUserFromRequestMock.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/settings/backup", {
      method: "GET",
    });

    const response = await backupExportRoute.GET(request);
    expect(response.status).toBe(401);
  });

  it("GET /api/settings/backup returns snapshot for super admin", async () => {
    getUserFromRequestMock.mockResolvedValue({
      id: "sa-1",
      role: "SUPER_ADMIN",
      email: "sa@lighthousemediagroup.com",
      name: "Super",
    } as any);
    createAndStoreBackupSnapshotMock.mockResolvedValue({
      snapshot: { generatedAt: "2026-01-01T00:00:00.000Z", tables: {} },
      record: { id: "bk-1" },
    } as any);

    const request = new NextRequest(
      "http://localhost/api/settings/backup?download=0",
      { method: "GET" },
    );

    const response = await backupExportRoute.GET(request);
    expect(response.status).toBe(200);
  });

  it("POST /api/settings/backup enforces backup secret", async () => {
    process.env.BACKUP_SCHEDULE_SECRET = "secret-123";

    const request = new NextRequest("http://localhost/api/settings/backup", {
      method: "POST",
      headers: {
        "x-backup-secret": "wrong",
      },
    });

    const response = await backupExportRoute.POST(request);
    expect(response.status).toBe(403);
  });

  it("GET /api/settings/backups returns 403 for non-super-admin", async () => {
    getUserFromRequestMock.mockResolvedValue({
      id: "u-1",
      role: "USER",
    } as any);

    const request = new NextRequest("http://localhost/api/settings/backups", {
      method: "GET",
    });

    const response = await backupHistoryRoute.GET(request);
    expect(response.status).toBe(403);
  });

  it("GET /api/settings/backups returns backup list", async () => {
    getUserFromRequestMock.mockResolvedValue({
      id: "sa-1",
      role: "SUPER_ADMIN",
    } as any);
    listBackupRecordsMock.mockResolvedValue([{ id: "bk-1" }] as any);

    const request = new NextRequest(
      "http://localhost/api/settings/backups?take=10",
      { method: "GET" },
    );

    const response = await backupHistoryRoute.GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.backups).toHaveLength(1);
  });

  it("POST /api/settings/backups/[id] returns 404 when backup missing", async () => {
    getUserFromRequestMock.mockResolvedValue({
      id: "sa-1",
      role: "SUPER_ADMIN",
      email: "sa@lighthousemediagroup.com",
      name: "Super",
    } as any);
    loadBackupRecordByIdMock.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/settings/backups/x", {
      method: "POST",
    });

    const response = await backupDetailRoute.POST(request, {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
    expect(restoreBackupSnapshotMock).not.toHaveBeenCalled();
  });
});
