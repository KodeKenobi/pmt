import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import {
  findUserByEmail,
  findUserById,
  findUserTeamMemberships,
} from "./user-store";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function getUserById(userId: string) {
  const user = await findUserById(userId);
  if (!user) return null;

  const teamMemberships = await findUserTeamMemberships(userId);
  return {
    ...user,
    teamMemberships,
  };
}

export async function getUserByEmail(email: string) {
  return findUserByEmail(email);
}

export async function getUserFromRequest(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  if (!userId) return null;

  return getUserById(userId);
}

export function isInternalStaffEmail(email: string) {
  return email
    .trim()
    .toLowerCase()
    .endsWith("@lighthousemediagroup.com");
}
