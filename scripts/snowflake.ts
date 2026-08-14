/**
 * Snowflake connection for the extract scripts.
 *
 * Reads ~/.snowflake/connections.toml so the extract uses exactly the same
 * credentials an analyst uses interactively. Auth is externalbrowser (SSO) with
 * a cached token, which is why extraction runs on a laptop and never on Vercel.
 *
 * If a key-pair service user is ever provisioned, set SNOWFLAKE_PRIVATE_KEY_PATH
 * and this switches to it with no other change.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import snowflake from "snowflake-sdk";

snowflake.configure({ logLevel: "ERROR" });

type Conn = Record<string, string>;

function readConnectionsToml(): Conn {
  const path = join(homedir(), ".snowflake", "connections.toml");
  const text = readFileSync(path, "utf8");
  const conn: Conn = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/i);
    if (m) conn[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return conn;
}

let connection: snowflake.Connection | null = null;

export async function connect(): Promise<snowflake.Connection> {
  if (connection) return connection;

  const toml = readConnectionsToml();
  const keyPath = process.env.SNOWFLAKE_PRIVATE_KEY_PATH;

  const options: snowflake.ConnectionOptions = keyPath
    ? {
        account: process.env.SNOWFLAKE_ACCOUNT ?? toml.account,
        username: process.env.SNOWFLAKE_USER ?? toml.user,
        authenticator: "SNOWFLAKE_JWT",
        privateKey: readFileSync(keyPath, "utf8"),
      }
    : {
        account: toml.account,
        username: toml.user,
        authenticator: "EXTERNALBROWSER",
        clientStoreTemporaryCredential: true,
      };

  const c = snowflake.createConnection(options);
  await new Promise<void>((resolve, reject) => {
    c.connectAsync((err) => (err ? reject(err) : resolve()));
  });
  connection = c;
  return c;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
): Promise<T[]> {
  const c = await connect();
  return new Promise((resolve, reject) => {
    c.execute({
      sqlText: sql,
      complete: (err, _stmt, rows) =>
        err ? reject(err) : resolve((rows ?? []) as T[]),
    });
  });
}

export async function disconnect(): Promise<void> {
  if (!connection) return;
  const c = connection;
  connection = null;
  await new Promise<void>((resolve) => c.destroy(() => resolve()));
}
