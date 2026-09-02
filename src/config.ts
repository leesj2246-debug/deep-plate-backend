import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경 변수가 필요합니다.`);
  return value;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3001");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT는 1~65535 사이의 정수여야 합니다.");
  }
  return port;
}

function jwtSecret(): string {
  const value = required("JWT_SECRET");
  if (value.length < 32) throw new Error("JWT_SECRET은 32자 이상이어야 합니다.");
  return value;
}

export function loadConfig() {
  return {
    databaseUrl: required("DATABASE_URL"),
    frontendOrigin: required("FRONTEND_ORIGIN"),
    jwtSecret: jwtSecret(),
    port: parsePort(process.env.PORT),
  };
}
