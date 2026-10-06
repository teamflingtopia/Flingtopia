import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fail } from "./domain.mjs";

export function createMediaStorage(config) {
  const valid = (name) => {
    if (!/^[a-f0-9-]{36}\.jpg$/.test(name))
      throw new Error("Invalid media key");
    return name;
  };
  if (config.mediaStorage !== "supabase")
    return {
      async ready() {},
      async put(name, bytes) {
        await mkdir(config.mediaDir, { recursive: true });
        await writeFile(resolve(config.mediaDir, valid(name)), bytes);
      },
      async get(name) {
        try {
          return await readFile(resolve(config.mediaDir, valid(name)));
        } catch (e) {
          if (e.code === "ENOENT")
            throw fail(404, "Photo unavailable.", "NOT_FOUND");
          throw e;
        }
      },
      async remove(name) {
        await unlink(resolve(config.mediaDir, valid(name))).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
      },
    };
  const url = new URL(config.supabaseUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/"
  )
    throw new Error("SUPABASE_URL must be an HTTPS project origin");
  if (
    !config.supabaseServiceKey ||
    !/^[a-z0-9-]+$/.test(config.supabaseBucket || "")
  )
    throw new Error("Supabase storage credentials and bucket are required");
  const bucket = config.supabaseBucket;
  async function request(path, options = {}) {
    const response = await fetch(`${url.origin}/storage/v1/${path}`, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        apikey: config.supabaseServiceKey,
        Authorization: `Bearer ${config.supabaseServiceKey}`,
        ...options.headers,
      },
    });
    if (!response.ok) {
      await response.arrayBuffer();
      throw fail(
        response.status === 404 ? 404 : 503,
        "Photo storage unavailable.",
        "STORAGE_UNAVAILABLE",
      );
    }
    return response;
  }
  return {
    async ready() {
      const info = await (await request(`bucket/${bucket}`)).json();
      if (info.public !== false)
        throw new Error("Photo storage bucket must be private");
    },
    async put(name, bytes) {
      await (
        await request(`object/${bucket}/${valid(name)}`, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
          body: bytes,
        })
      ).arrayBuffer();
    },
    async get(name) {
      return Buffer.from(
        await (
          await request(`object/authenticated/${bucket}/${valid(name)}`)
        ).arrayBuffer(),
      );
    },
    async remove(name) {
      await (
        await request(`object/${bucket}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: [valid(name)] }),
        })
      ).arrayBuffer();
    },
  };
}
