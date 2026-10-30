import { database, one, rows } from "@/db";
import { compare } from "bcryptjs";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { type User, loginInput } from "./domain";
import { AppError } from "./errors";
import { accountAccess } from "./policies";

export const SESSION_COOKIE = "campusfix_session";
const userColumns = sql`u.user_id,u.institutional_id,u.full_name,u.email,u.phone_number,u.role,u.pref_email,u.pref_sms,u.pref_in_app,u.is_active`;
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function getUser(token?: string): Promise<User | null> {
  const value = token ?? (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value || value.length !== 64) return null;
  const user = await one(
    sql`SELECT ${userColumns} FROM sessions s JOIN users u ON u.user_id=s.user_id WHERE s.token_hash=${hash(value)} AND s.expires_at>NOW() AND u.is_active=TRUE`,
  );
  return (user as unknown as User) ?? null;
}
export async function requireUser(token?: string) {
  const user = await getUser(token);
  if (!user)
    throw new AppError("Please sign in to continue.", 401, "SIGN_IN_REQUIRED");
  return user;
}
export async function login(input: unknown, ip: string | null = null) {
  const data = loginInput.parse(input);
  // Hash work is also performed for an unknown account to reduce timing differences.
  const dummyHash =
    "$2b$12$D8qdUL9pViSSxTMM1cN9BOO6jY6EcA3r82.XW5iiXrRZJnQl7pnO6";
  const result = await database().transaction(async (tx) => {
    const account = await one(
      sql`SELECT * FROM users WHERE LOWER(email)=LOWER(${data.identifier}) OR institutional_id=${data.identifier} FOR UPDATE`,
      tx,
    );
    if (!account) {
      await compare(data.password, dummyHash);
      await rows(
        sql`INSERT INTO audit_logs(event_code,details,ip_address) VALUES ('LOGIN_FAILED','Unknown account',${ip}::inet)`,
        tx,
      );
      return {
        error: "The email, ID, or password is not correct.",
        status: 401,
      };
    }
    const access = accountAccess(
      Boolean(account.is_active),
      account.locked_until as Date | null,
      Date.now(),
    );
    if (access === "INACTIVE")
      return {
        error: "This account is not active. Contact the administrator.",
        status: 403,
      };
    if (access === "LOCKED")
      return {
        error: "This account is locked. Try again after 30 minutes.",
        status: 429,
      };
    const reset =
      account.locked_until &&
      new Date(account.locked_until as string).getTime() <= Date.now();
    const valid = await compare(data.password, account.password_hash as string);
    if (!valid) {
      const failures = reset ? 1 : Number(account.failed_attempts) + 1;
      await rows(
        sql`UPDATE users SET failed_attempts=${failures},is_locked=${failures >= 5},locked_until=CASE WHEN ${failures}>=5 THEN NOW()+INTERVAL '30 minutes' ELSE NULL END WHERE user_id=${account.user_id}::uuid`,
        tx,
      );
      await rows(
        sql`INSERT INTO audit_logs(actor_id,event_code,details,ip_address) VALUES (${account.user_id}::uuid,'LOGIN_FAILED',${failures >= 5 ? "Account locked after five failed attempts" : "Invalid password"},${ip}::inet)`,
        tx,
      );
      return {
        error:
          failures >= 5
            ? "This account is locked. Try again after 30 minutes."
            : "The email, ID, or password is not correct.",
        status: failures >= 5 ? 429 : 401,
      };
    }
    const token = randomBytes(32).toString("hex");
    await rows(
      sql`UPDATE users SET failed_attempts=0,is_locked=FALSE,locked_until=NULL,updated_at=NOW() WHERE user_id=${account.user_id}::uuid`,
      tx,
    );
    await rows(
      sql`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (${hash(token)},${account.user_id}::uuid,NOW()+INTERVAL '120 minutes')`,
      tx,
    );
    await rows(
      sql`INSERT INTO audit_logs(actor_id,event_code,details,ip_address) VALUES (${account.user_id}::uuid,'LOGIN_SUCCESS','Signed in',${ip}::inet)`,
      tx,
    );
    return { token };
  });
  if ("error" in result) throw new AppError(result.error!, result.status);
  return result.token;
}
export async function logout(token: string | undefined) {
  if (token)
    await rows(sql`DELETE FROM sessions WHERE token_hash=${hash(token)}`);
}
