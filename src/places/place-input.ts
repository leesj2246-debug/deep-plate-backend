import { InputError } from "../input-error.js";

export type PlaceFilters = {
  area?: string;
  category?: string;
  budget?: number;
};

function optionalQueryText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new InputError(`${field}는 하나의 문자열이어야 합니다.`);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 80) throw new InputError(`${field}는 80자 이하여야 합니다.`);
  return trimmed;
}

export function parsePlaceFilters(query: Record<string, unknown>): PlaceFilters {
  const area = optionalQueryText(query.area, "area");
  const category = optionalQueryText(query.category, "category");
  let budget: number | undefined;

  if (query.budget !== undefined && query.budget !== "") {
    if (typeof query.budget !== "string" || !/^\d+$/.test(query.budget)) {
      throw new InputError("budget은 0 이상의 정수여야 합니다.");
    }
    budget = Number(query.budget);
    if (!Number.isSafeInteger(budget)) throw new InputError("budget 값이 너무 큽니다.");
  }

  return { ...(area && { area }), ...(category && { category }), ...(budget !== undefined && { budget }) };
}
