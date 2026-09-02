import assert from "node:assert/strict";
import test from "node:test";

import { parseLoginInput, parseRegisterInput } from "../src/auth/auth-input.js";
import { InputError } from "../src/input-error.js";

test("회원가입 입력의 이름과 이메일을 정리한다", () => {
  assert.deepEqual(parseRegisterInput({
    name: "  사토 유키  ",
    email: " YUKI@Example.COM ",
    password: "password123",
  }), {
    name: "사토 유키",
    email: "yuki@example.com",
    password: "password123",
  });
});

test("잘못된 이메일과 짧은 비밀번호를 거부한다", () => {
  assert.throws(() => parseRegisterInput({ name: "유키", email: "wrong", password: "password123" }), InputError);
  assert.throws(() => parseLoginInput({ email: "yuki@example.com", password: "short" }), InputError);
});
