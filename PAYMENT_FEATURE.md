# 미션 8: Deep Plate 테스트 결제

## 선택과 범위

선택한 고도화 기능은 **결제 기능**입니다. 큐레이션 신청 직후 회원가입을 다시 요구하면 이탈이 커지므로, Tally 신청 제출 → 비회원 주문 → 승인 → 결과 확인을 연결합니다. 기존 로그인은 관심 식당 저장과 회원 주문 내역에 유지합니다.

- 테스트 상품: `curation-demo`, `Deep Plate 1:1 큐레이션 신청 결제`, 10,000 KRW
- 금액은 기존 실습에서 사용한 **과제용 값이며 실제 판매가격이 아닙니다.** 실제 큐레이션 제공, 고객 발송, 실결제는 포함하지 않습니다.
- 상품 하나, 일회성 카드/간편결제 테스트, 비회원 현재 주문 결과와 회원별 주문 내역까지만 구현합니다.
- 환불, 정기결제, 가상계좌, Toss 결제 웹훅, 이메일 발송은 이번 범위에서 제외합니다. Tally 신청 확인 웹훅은 포함합니다.

## 기존 실습에서 바꾼 점

`payment-lab-next`의 서버 상품 카탈로그와 `paymentKey / orderId / amount` 승인 흐름을 Express에 맞게 옮겼습니다. Next 라우트와 전역 `Map`을 복사하지 않고 기존 PostgreSQL/Prisma에 `payment_orders` 테이블을 추가했습니다. 따라서 Vercel 함수의 재시작·다른 인스턴스에서도 동일 주문을 조회할 수 있습니다. 실제 연결 DB에 마이그레이션을 적용해야 작동합니다.

기존 예제의 매 요청 임의 멱등키는 **주문 생성 시 발급하고 DB에 보관하는 고정 UUID**로 바꿨습니다. mock 키도 단순 접두사 확인 대신 해당 주문의 `mock_<orderId>`만 허용합니다. Toss 모드에서는 mock 키를 거절합니다.

## 환경 설정

`.env.example`에 설정 이름만 공개하고 값은 `.env` 또는 배포 환경 변수에 둡니다.

| 변수 | 역할 |
| --- | --- |
| `PAYMENT_MODE` | 기본 `disabled`. `mock` 또는 `toss-test`를 명시해야 주문 생성 가능 |
| `TOSS_CLIENT_KEY` | `test_ck_` 또는 `test_gck_`로 시작하는 공개 클라이언트 키 |
| `TOSS_SECRET_KEY` | `test_sk_` 또는 `test_gsk_`로 시작하는 서버 전용 시크릿 키 |
| `TALLY_FORM_ID` | 결제 진입을 허용할 Tally 폼 ID |
| `TALLY_SIGNING_SECRET` | `Tally-Signature` HMAC 검증용 서버 비밀값 |

`toss-test`는 동일 종류의 한 세트 키가 필요합니다. 실제 상점 키의 정확한 짝은 Toss가 최종 검증합니다. `live_*` 및 잘못된 형식의 키는 **disabled/mock에서도 설정 오류로 차단**합니다. 시크릿을 `VITE_*`, GitHub, 화면, 로그에 넣지 않습니다. 새 결제 설정이 없어도 기존 회원·식당 기능은 유지됩니다.

### 실행

1. 기존 개발용 환경에 `PAYMENT_MODE=mock`을 설정합니다. mock에는 PG 키가 필요하지 않습니다.
2. **대상 DB를 확인하고 적용 승인 범위 안에서만** 추가 마이그레이션을 실행합니다. 기존 데이터를 리셋하거나 seed를 다시 넣을 필요가 없습니다.
3. `npm.cmd run db:deploy` → `npm.cmd run db:generate` → `npm.cmd run dev`.
4. 프론트가 이 백엔드를 향하게 합니다. 결제에는 로그인이 필요하지 않으며 저장 기능·회원 주문 내역만 기존 계정을 사용합니다.
5. Toss 개발 환경을 검증할 때만 `PAYMENT_MODE=toss-test`와 테스트 키 한 세트를 설정합니다.

2026-09-18 로컬 `deep_plate_dev`에 결제 테이블과 비회원 주문 마이그레이션을 적용했습니다. 기존 회원 주문과 테스트 계정은 보존했습니다. 실제 HTTP/PostgreSQL에서 비회원 주문 생성, 주문 전용 토큰 승인, PAID 저장을 확인했습니다. 운영 DB 적용과 외부 Toss sandbox 요청은 아직 미검증입니다.

## 사용자 시나리오

1. 사용자가 Tally 큐레이션 신청서를 제출합니다.
2. 회원가입 없이 결제 화면으로 이동합니다.
3. Tally 웹훅이 제출 ID를 서명 검증해 저장합니다. 주문 생성 시 상품 ID와 제출 ID를 서버로 보내며, 검증된 제출만 이름·금액·통화·모드를 결정하고 해당 주문 한 건에만 유효한 7일 만료 서명 토큰을 반환합니다.
4. mock 모드는 명확히 표시한 시뮬레이션 승인을 실행합니다. toss-test 모드는 테스트 결제창에서 인증한 뒤 복귀 페이지에서 서버 승인 API를 호출합니다.
5. 서버가 승인 결과를 확인한 뒤에만 완료 화면을 표시합니다. 비회원은 현재 브라우저에서 해당 주문만 확인하며, 로그인 사용자는 주문 내역에서 mock/toss-test를 구분합니다.
6. 인증 실패·사용자 취소 화면에서는 승인 API를 호출하지 않습니다. 결제사 승인 결과가 모호하면 새 주문 대신 기존 주문의 **상태 다시 확인**을 제공합니다.

## API 계약

회원 API는 `Authorization: Bearer <JWT>`를 사용합니다. 비회원 결제 API는 주문 생성 응답의 `checkoutToken`을 `X-Checkout-Token` 헤더로 전달하며, 토큰의 주문번호와 요청 주문번호가 같아야 합니다. 모든 결제 응답은 `Cache-Control: no-store`입니다.

| API | 입력 / 응답 |
| --- | --- |
| `GET /payments/product` | `{product:{id,name,amount,currency},mode,available,clientKey?}`. clientKey는 toss-test에서만 제공 |
| `POST /webhooks/tally` | 원문 JSON + `Tally-Signature`. 서명·폼 ID 검증 후 제출 메타데이터만 저장, 성공 `204` |
| `POST /payments/guest/orders` | `{productId,applicationSubmissionId}` → `201 {order,checkoutToken}`. 같은 제출 ID는 같은 주문 반환 |
| `POST /payments/guest/confirm` | 주문 토큰 + `{orderId,paymentKey,amount}` → `200 {order}` |
| `POST /payments/guest/orders/:orderId/reconcile` | 주문 토큰으로 해당 비회원 주문만 복구 |
| `GET /payments/orders/me` | 현재 회원의 최근 최대 50건 `{orders:[...]}` |
| `GET /payments/orders/:orderId` | 본인 주문 `{order}`. 타인 주문은 존재 여부도 공개하지 않고 404 |
| `POST /payments/confirm` | `{orderId,paymentKey,amount}` → `200 {order}` |
| `POST /payments/orders/:orderId/reconcile` | 본문 불필요. 서버에 저장된 결제키로 기존 주문 복구 → `{order}` |

공개 `order`는 `id, productId, name, amount, currency, status, mode, createdAt, paidAt, failureCode`를 포함합니다. 날짜는 ISO 문자열이며 `paidAt/failureCode`는 null일 수 있습니다. 내부 paymentKey, 멱등키, 잠금값, 사용자 ID, 카드 정보, PG 원문은 노출하지 않습니다.

결제 오류는 `{code,message}` 형식입니다. 기존 인증 오류는 기존 `{message}` 형식을 유지합니다.

| 코드 | 의미 / 화면 대응 |
| --- | --- |
| `PAYMENTS_DISABLED` (503) | 결제 기능 미설정 안내, 실행 버튼 비활성 |
| `APPLICATION_VERIFICATION_UNAVAILABLE` (503) | Tally 서명 환경이 없어 주문 생성 차단 |
| `APPLICATION_NOT_VERIFIED` (409) | 웹훅 수신 전이거나 검증되지 않은 제출, 같은 신청으로 잠시 후 재시도 |
| `INVALID_PAYMENT_INPUT`, `AMOUNT_MISMATCH` (400) | 잘못된 입력 안내, 승인하지 않음 |
| `ORDER_NOT_FOUND` (404) | 주문 없음 또는 다른 사용자 소유 |
| `CHECKOUT_ACCESS_REQUIRED` (401) | 비회원 주문 토큰 없음·만료·서명 불일치 |
| `PAYMENT_PROCESSING` (409) | 다른 요청이 확인 중. 같은 주문 상태를 잠시 후 확인 |
| `PAYMENT_UNCERTAIN` (502) | 결제사 결과 불명. 실패로 단정하지 않고 같은 주문 복구 |
| `PAYMENT_REVIEW_REQUIRED` (409/502) | 응답 불일치/미지원 수단/오래된 주문. 완료 표시 금지, 운영 확인 필요 |
| `PAYMENT_DECLINED` (422/409) | PG 실패·취소 확인 또는 최초 승인에서 결제키 무효/만료와 결제 정보 없음이 함께 확인된 주문 |
| `PAYMENT_SERVER_ERROR` (500) | 저장 등 내부 처리 실패. 주문 내역부터 재확인 |

## 데이터와 중복 처리

기존 사용자·식당·저장·회원 주문을 삭제하지 않습니다. 비회원 주문을 위해 `user_id`를 선택값으로 바꾸고 `application_submission_id`를 추가했습니다. DB CHECK 제약으로 회원 ID와 제출 ID 중 정확히 하나만 존재하게 합니다. 사용자 외래키는 `ON DELETE RESTRICT`이며 주문 삭제 API는 없습니다.

`curation_submissions`에는 제출 ID, 폼 ID, 웹훅 이벤트 ID와 제출 시각만 저장합니다. Tally 답변 원문·연락처·파일 URL은 저장하지 않으며, HMAC 서명이 유효한 지정 폼 제출만 기록합니다.

`PENDING → CONFIRMING → PAID 또는 FAILED` 순서이며, 불명확한 결과는 `CONFIRMING`에 머뭅니다.

- DB의 조건부 `updateMany`로 한 요청만 45초 임대를 얻습니다. 같은 주문을 여러 서버가 동시에 처리해도 한 승인 요청만 진행합니다.
- 함수가 중단되면 임대 만료 후 복구합니다. 오래된 요청이 새 요청의 잠금을 해제하지 않도록 고유 잠금 토큰을 비교합니다.
- 주문 결제키는 첫 승인에서 고정합니다. 이후 다른 결제키를 거절하고 DB UNIQUE 제약으로 서로 다른 주문에 같은 키를 저장하지 못하게 합니다.
- 승인/조회 요청은 8초 제한이 있습니다. PG 오류 뒤 다시 조회해 이미 승인되었는지 확인합니다.
- 재시도는 저장된 결제키와 고정 멱등키를 유지합니다. Toss `DONE`, 주문번호, 결제키, 원래 금액, KRW, NORMAL 유형, 지원 수단, 승인 시각이 일치해야 PAID로 저장합니다.
- FAILED는 PG가 `ABORTED`, `EXPIRED`, `CANCELED`를 반환하면 기록합니다. 추가로 최초 PENDING 승인에서 `INVALID_PAYMENT_KEY`(400), `NOT_FOUND_PAYMENT`(404), `NOT_FOUND_PAYMENT_SESSION`(404) 중 하나를 받고 후속 조회도 정확한 `NOT_FOUND_PAYMENT`(404)를 반환하면 실패로 종료해 새 주문을 허용합니다.
- 위 예외는 두 조건이 모두 확인된 첫 승인에만 적용합니다. 이전 CONFIRMING 주문, 타임아웃, 이미 처리됨, 일반 4xx, 코드 없는 404, 조회 장애는 자동 FAILED로 바꾸지 않습니다. PG 오류의 제한된 code/status만 내부 판단에 사용하며 원문 message는 버립니다.
- PG 멱등키 보존 기간을 고려해 생성 후 14일이 지난 CONFIRMING 주문은 조회만 하고 자동 재승인하지 않습니다.
- PAID 주문의 동일 승인 요청은 기존 결과를 반환합니다. 실제 PG 승인 뒤 DB 저장이 실패했어도 기존 주문 재조회로 복구할 수 있도록 키가 먼저 저장됩니다.

## 검증

```powershell
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

결제 자동 검증은 기존 테스트와 함께 실행되며 현재 34개가 통과합니다. 자동 테스트의 HTTP 요청은 실제 Express, Tally HMAC, 비회원 주문 토큰을 통과하지만 DB와 Toss 응답은 대역을 사용합니다. 이와 별도로 로컬 PostgreSQL/HTTP mock 통합 검증을 실행해 비회원 주문·소유권·금액 검증·영속성을 확인했습니다. 로컬 브라우저에서는 Toss 공식 샘플의 공개 테스트 키로 sandbox 결제창이 열리고 간편결제·카드 목록이 표시되는 것까지 확인했습니다. 결제수단 인증과 sandbox 서버 승인은 배포 전 별도 검증해야 합니다.

- mock 성공과 내역 조회, 동일 승인 중복, 서비스 인스턴스 재생성 후 기존 주문 조회
- 미인증 요청, 다른 사용자 주문 접근, 서버 가격 덮어쓰기와 금액 변조
- 비회원 토큰의 주문 한 건 제한, 회원 JWT와의 구분, 다른 주문 접근 차단
- 잘못된 mock 키와 모드 변경/우회, 테스트 키 미설정, 실키 차단
- 동시 요청 시 하나만 승인 진행, 함수 잠금 만료 뒤 복구
- PG 타임아웃 뒤 DONE 조회 복구, 승인/조회 모두 실패 뒤 동일 멱등키 재시도
- PG 실패/취소 확인, PG 주문·금액·통화·키·상태·수단 불일치
- 최초의 확정 결제키 오류와 후속 결제 없음 확인 후 새 주문 허용, 불확실/이미 처리됨/일반 오류 및 이전 CONFIRMING 보존
- HTTP 어댑터의 고정 멱등키, 타임아웃 신호, PG 오류 원문 비노출

수동 데모: Tally 신청 완료 상태 → 로그인 없는 테스트 상품 주문 → mock 승인 → 완료. `toss-test`에서는 **토스 간편결제로 결제하기** 버튼 한 번으로 sandbox 카드·간편결제창이 열립니다. 회원으로 로그인하면 기존 주문 내역도 확인할 수 있습니다. 실패 데모는 승인 요청 amount를 변경해 400 응답과 미승인 상태를 확인합니다. 외부 결제창 취소는 fail 화면만 표시하고 서버 승인 요청이 없는지 확인합니다.

## 확장과 한계

상품·승인·PG 호출을 분리해 이후 다른 상품이나 승인 제공자를 추가할 수 있습니다. 다만 지금은 테스트 전용이며 실제 판매용으로 사용할 수 없습니다. 실제 상용화에는 가격/상품 제공 정책, 환불과 웹훅 검증, 운영자 복구 도구, 속도 제한·모니터링, 법적·사업자 요건을 별도 설계해야 합니다. 자동 백그라운드 정산 없이 사용자가 기존 주문을 조회·복구하는 최소 범위입니다. 최대 50건 내역 이후 페이지 나누기도 확장 항목입니다.

결제수단 제한은 프론트의 카드 요청/선택 수단 검사와 서버의 승인 결과 검사로 이루어집니다. API를 직접 조작하면 미지원 수단의 **테스트 승인**이 PG에서 먼저 발생한 뒤 서버가 완료 처리를 거절할 수 있습니다. 승인 전 모든 결제수단을 서버에서 차단하거나 자동 취소하는 구조는 이번 범위에 없습니다. 실키는 별도로 차단하므로 이 서비스가 실청구에 사용되지는 않습니다. 이전 승인 결과가 모호했던 주문은 이후 정보가 없더라도 자동 실패로 바꾸지 않아 운영자 확인이 필요할 수 있습니다.

## 공식 근거

확인일: 2026-09-18.

- [Toss 결제위젯 연동](https://docs.tosspayments.com/guides/v2/payment-widget/integration): 인증 후 서버 승인, 금액 검증, 테스트 결제 흐름
- [Toss API 레퍼런스](https://docs.tosspayments.com/reference): Payment 상태·금액·통화·결제키
- [API 키](https://docs.tosspayments.com/reference/using-api/api-keys): test/live 구분, 클라이언트/시크릿 키 종류
- [인증 및 기타 헤더](https://docs.tosspayments.com/reference/using-api/authorization): 서버 인증과 멱등키
- [API 오류 코드](https://docs.tosspayments.com/reference/error-codes): 잘못된 결제키, 없는 결제 정보, 만료된 결제 세션 구분
