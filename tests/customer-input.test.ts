import assert from "node:assert/strict";
import test from "node:test";

import { parseCreateCustomerInput, parseDeleteCustomerInput } from "../src/customers/customer-input.js";
import { InputError } from "../src/input-error.js";

test("고객 입력의 공백을 정리하고 선택값을 null로 변환한다", () => {
  assert.deepEqual(parseCreateCustomerInput({
    displayName: "  사토 유키  ",
    contactType: " Instagram DM ",
    contactValue: " ",
  }), {
    displayName: "사토 유키",
    contactType: "Instagram DM",
    contactValue: null,
    preferredLanguage: null,
  });
});

test("고객 이름이 없으면 입력을 거부한다", () => {
  assert.throws(() => parseCreateCustomerInput({ displayName: " " }), InputError);
});

test("삭제 사유와 처리자를 선택적으로 받는다", () => {
  assert.deepEqual(parseDeleteCustomerInput({ deletedBy: "가온", deleteReason: "중복 등록" }), {
    deletedBy: "가온",
    deleteReason: "중복 등록",
  });
});
