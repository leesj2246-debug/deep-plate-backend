import { InputError } from "../input-error.js";

export type CreateCustomerInput = {
  displayName: string;
  contactType: string | null;
  contactValue: string | null;
  preferredLanguage: string | null;
};

export type DeleteCustomerInput = {
  deletedBy: string | null;
  deleteReason: string | null;
};

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new InputError(`${field}는 문자열이어야 합니다.`);

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) throw new InputError(`${field}는 ${maxLength}자 이하여야 합니다.`);
  return trimmed;
}

export function parseCreateCustomerInput(body: unknown): CreateCustomerInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InputError("요청 본문은 객체여야 합니다.");
  }

  const value = body as Record<string, unknown>;
  if (typeof value.displayName !== "string" || !value.displayName.trim()) {
    throw new InputError("displayName은 필수입니다.");
  }

  const displayName = value.displayName.trim();
  if (displayName.length > 100) throw new InputError("displayName은 100자 이하여야 합니다.");

  return {
    displayName,
    contactType: optionalText(value.contactType, "contactType", 30),
    contactValue: optionalText(value.contactValue, "contactValue", 255),
    preferredLanguage: optionalText(value.preferredLanguage, "preferredLanguage", 10),
  };
}

export function parseDeleteCustomerInput(body: unknown): DeleteCustomerInput {
  if (body === undefined || body === null) return { deletedBy: null, deleteReason: null };
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new InputError("요청 본문은 객체여야 합니다.");
  }

  const value = body as Record<string, unknown>;
  return {
    deletedBy: optionalText(value.deletedBy, "deletedBy", 100),
    deleteReason: optionalText(value.deleteReason, "deleteReason", 500),
  };
}
