import { InputError } from "../input-error.js";

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type LoginInput = Pick<RegisterInput, "email" | "password">;

function readBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InputError("요청 본문은 객체여야 합니다.");
  }
  return body as Record<string, unknown>;
}

function readEmail(value: unknown): string {
  if (typeof value !== "string") throw new InputError("email은 필수입니다.");
  const email = value.trim().toLowerCase();
  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new InputError("올바른 email을 입력해 주세요.");
  }
  return email;
}

function readPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8) {
    throw new InputError("password는 8자 이상이어야 합니다.");
  }
  if (value.length > 128) throw new InputError("password는 128자 이하여야 합니다.");
  return value;
}

export function parseRegisterInput(body: unknown): RegisterInput {
  const value = readBody(body);
  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new InputError("name은 필수입니다.");
  }
  const name = value.name.trim();
  if (name.length > 100) throw new InputError("name은 100자 이하여야 합니다.");

  return {
    name,
    email: readEmail(value.email),
    password: readPassword(value.password),
  };
}

export function parseLoginInput(body: unknown): LoginInput {
  const value = readBody(body);
  return {
    email: readEmail(value.email),
    password: readPassword(value.password),
  };
}
