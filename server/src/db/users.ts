import type { User } from "../types";

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  return db
    .prepare(
      "SELECT id, email, display_name, created_at, updated_at FROM users WHERE id = ?",
    )
    .bind(id)
    .first<User>();
}

export async function getUserByEmail(
  db: D1Database,
  email: string,
): Promise<User | null> {
  return db
    .prepare(
      "SELECT id, email, display_name, created_at, updated_at FROM users WHERE email = ?",
    )
    .bind(email)
    .first<User>();
}

export async function ensureDefaultUser(db: D1Database): Promise<User> {
  const existing = await getUserById(db, "default");
  if (existing) return existing;

  await db
    .prepare(
      "INSERT INTO users (id, email, display_name) VALUES ('default', NULL, 'Default')",
    )
    .run();

  const user = await getUserById(db, "default");
  if (!user) throw new Error("Failed to create default user");
  return user;
}

export async function upsertUserFromEmail(
  db: D1Database,
  email: string,
): Promise<User> {
  const existing = await getUserByEmail(db, email);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const displayName = email.split("@")[0] ?? email;

  await db
    .prepare(
      "INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)",
    )
    .bind(id, email, displayName)
    .run();

  const user = await getUserById(db, id);
  if (!user) throw new Error("Failed to create user");
  return user;
}

export async function upsertUserFromAccessSub(
  db: D1Database,
  sub: string,
): Promise<User> {
  const existing = await getUserById(db, sub);
  if (existing) return existing;

  const displayName = `User ${sub.slice(0, 8)}`;

  await db
    .prepare(
      "INSERT INTO users (id, email, display_name) VALUES (?, NULL, ?)",
    )
    .bind(sub, displayName)
    .run();

  const user = await getUserById(db, sub);
  if (!user) throw new Error("Failed to create user");
  return user;
}
