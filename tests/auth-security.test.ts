import assert from "node:assert/strict";
import test from "node:test";

import { createAccessToken, hashPassword, verifyAccessToken, verifyPassword } from "../src/auth/auth-security.js";

test("비밀번호는 평문이 아닌 scrypt 해시로 저장하고 검증한다", async () => {
  const password = "deep-plate-password";
  const hash = await hashPassword(password);

  assert.equal(hash.includes(password), false);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("JWT의 서명과 만료 시간을 확인한다", () => {
  const secret = "test-secret-that-is-longer-than-32-characters";
  const token = createAccessToken("user-id", secret, 1_000);

  assert.equal(verifyAccessToken(token, secret, 1_001), "user-id");
  assert.equal(verifyAccessToken(`${token}changed`, secret, 1_001), null);
  assert.equal(verifyAccessToken(`${token}.extra`, secret, 1_001), null);
  assert.equal(verifyAccessToken(token, secret, 1_000 + 60 * 60 * 24 * 7), null);
});
