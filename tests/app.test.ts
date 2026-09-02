import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../src/app.js";
import type { Database } from "../src/db.js";

const options = {
  frontendOrigin: "http://localhost:5173",
  jwtSecret: "test-secret-that-is-longer-than-32-characters",
};

test("상태 확인, 없는 API, 잘못된 회원가입 요청에 JSON 응답을 보낸다", async () => {
  const app = createApp({} as Database, options);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const missing = await fetch(`http://127.0.0.1:${port}/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { message: "요청한 API를 찾을 수 없습니다." });

    const customers = await fetch(`http://127.0.0.1:${port}/customers`);
    assert.equal(customers.status, 404);
    assert.deepEqual(await customers.json(), { message: "요청한 API를 찾을 수 없습니다." });

    const invalid = await fetch(`http://127.0.0.1:${port}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "wrong" }),
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { message: "name은 필수입니다." });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
