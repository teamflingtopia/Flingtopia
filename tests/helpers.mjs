import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename } from "node:path";
export async function removeTestDirectory(directory) {
  const actual = await realpath(directory),
    root = await realpath(tmpdir());
  assert.equal(dirname(actual).toLowerCase(), resolve(root).toLowerCase());
  assert.match(
    basename(actual),
    /^flingtopia-(test|persistence|validation|legacy)-[a-zA-Z0-9]+$/,
  );
  await rm(actual, { recursive: true, force: true });
}
export function authenticatorCode(encoded, time = Date.now()) {
  let bits = "";
  for (const c of encoded)
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      .indexOf(c)
      .toString(2)
      .padStart(5, "0");
  const secret = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const offset = mac.at(-1) & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export function httpClient(base, origin = "http://127.0.0.1:5173") {
  let cookies = {};
  return {
    get cookies() {
      return { ...cookies };
    },
    set cookies(v) {
      cookies = { ...v };
    },
    async request(path, method = "GET", body, requestOrigin = origin) {
      const form = body instanceof FormData;
      const r = await fetch(
        `${base}${path.startsWith("/media/") ? "" : "/api/v1"}${path}`,
        {
          method,
          headers: {
            Origin: requestOrigin,
            Cookie: Object.entries(cookies)
              .map(([k, v]) => `${k}=${v}`)
              .join("; "),
            ...(body && !form ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? (form ? body : JSON.stringify(body)) : undefined,
        },
      );
      for (const c of r.headers.getSetCookie()) {
        const [name, value] = c.split(";")[0].split("=");
        cookies[name] = value;
      }
      const text = Buffer.from(await r.arrayBuffer()).toString();
      let result = text;
      try {
        result = JSON.parse(text);
      } catch {}
      return { status: r.status, body: result, headers: r.headers };
    },
  };
}
export async function enrollStaff(client) {
  const before = await client.request("/admin/queue");
  assert.equal(before.status, 403);
  assert.equal(before.body.error.code, "MFA_REQUIRED");
  const setup = await client.request("/staff/mfa/enroll", "POST", {
    password: "Test-password-1234",
  });
  assert.equal(setup.status, 200, JSON.stringify(setup.body));
  const code = authenticatorCode(setup.body.secret);
  const verified = await client.request("/staff/mfa/verify", "POST", { code });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return { secret: setup.body.secret, code };
}
