# Deep Plate Backend

Deep Plate 프론트엔드의 회원 인증, 식당 조회, 관심 식당 저장을 담당하는 Express + TypeScript + Prisma 백엔드입니다. 기존 관리자용 고객 코드는 보존하지만 공개 앱에서는 비활성화합니다.

## 구현 범위

- JWT 회원가입·로그인·현재 사용자 확인
- 지역·카테고리·예산으로 식당 목록 조회 및 상세 조회
- 로그인 사용자별 관심 식당 저장, 조회, 소프트 삭제, 재저장 시 복구
- PostgreSQL 데이터 모델과 한국어 오류 응답
- 로컬 서버와 Vercel이 함께 사용할 수 있는 Express 진입점

`User`, `Restaurant`, `SavedPlace`, `Customer`는 실제 행을 지우지 않고 `deletedAt`으로 삭제 상태를 기록합니다. 관심 식당은 `(userId, restaurantId)` 조합을 하나만 유지하며, 삭제한 식당을 다시 저장하면 기존 행을 복구합니다.

Customer 라우터와 테스트는 향후 관리자 화면을 위해 코드에 남겨 두었습니다. 관리자 인증과 권한 검사가 설계되기 전까지 공개 Express 앱에는 `/customers`를 마운트하지 않습니다.

## 환경 변수

`.env.example`을 복사해 `.env`를 만들고 실제 값으로 바꿉니다.

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
JWT_SECRET="32자 이상의 충분히 긴 임의 문자열"
FRONTEND_ORIGIN="http://localhost:5173"
PORT=3001
```

- 개발: 로컬 PostgreSQL 주소와 로컬 프론트엔드 주소를 사용합니다.
- 배포: Vercel 프로젝트에 운영 `DATABASE_URL`, `JWT_SECRET`, 실제 프론트엔드 주소를 따로 등록합니다.
- `.env`는 Git에 올리지 않습니다.

## 설치와 실행

```powershell
npm.cmd install
npm.cmd run db:generate
npm.cmd run dev
```

`prisma.config.ts`가 `DATABASE_URL`을 읽으므로 `db:generate`와 `db:validate`도 실행 전에 `DATABASE_URL`이 필요합니다. 두 명령은 올바른 형식의 임시 주소로 스키마와 Client를 검증할 수 있지만, 실제 서버 실행과 마이그레이션에는 접속 가능한 PostgreSQL 주소가 필요합니다.

데이터베이스 계정과 연결을 확인한 뒤에만 마이그레이션합니다.

```powershell
npm.cmd run db:migrate -- --name mission7_auth_places
```

이미 생성된 마이그레이션을 제한된 앱 계정이나 배포 환경에 적용할 때는 다음 명령을 사용합니다.

```powershell
npm.cmd run db:deploy
```

공식 서울관광정보 출처가 기록된 최소 식당 데이터를 개발 DB에 넣을 때는 다음 명령을 사용합니다. 사진은 사용 권한을 확인하지 않았으므로 포함하지 않습니다.

```powershell
npm.cmd run db:seed
```

로컬 개발 환경에서는 PostgreSQL 18의 `deep_plate_dev` 데이터베이스에 두 개의 마이그레이션을 적용하고, 공식 출처가 연결된 식당 3곳을 시드했습니다. 운영 배포에서는 별도의 운영 데이터베이스에 `db:deploy`와 `db:seed`를 다시 실행해야 합니다.

## API

기본 주소는 로컬에서 `http://localhost:3001`입니다. 인증 API가 돌려준 토큰은 보호된 요청의 `Authorization: Bearer TOKEN` 헤더로 보냅니다.

### 상태 확인

- `GET /health`
- 성공 `200`: `{ "status": "ok" }`

### 인증

#### `POST /auth/register`

```json
{
  "name": "사토 유키",
  "email": "yuki@example.com",
  "password": "password123"
}
```

- 성공 `201`: 공개 사용자 정보와 JWT
- 잘못된 입력 `400`
- 중복 이메일 `409`

#### `POST /auth/login`

```json
{
  "email": "yuki@example.com",
  "password": "password123"
}
```

- 성공 `200`: 공개 사용자 정보와 JWT
- 로그인 실패 `401`

#### `GET /auth/me`

- 인증 필요
- 성공 `200`: 현재 사용자 정보
- 토큰 없음·만료 `401`

로그아웃 엔드포인트는 없습니다. 현재 과제 범위에서는 프론트엔드가 저장한 토큰을 삭제하면 로그아웃됩니다.

### 식당

#### `GET /places`

선택 쿼리:

- `area`: 지역의 정확한 이름, 대소문자 구분 없음
- `category`: 카테고리의 정확한 이름, 대소문자 구분 없음
- `budget`: 사용자가 지출 가능한 최대 금액. 식당의 최소 예상 금액이 이 값 이하인 항목을 조회

예: `GET /places?area=을지로&category=한식&budget=30000`

- 성공 `200`: 삭제되지 않은 식당 배열
- 잘못된 쿼리 `400`

#### `GET /places/:slug`

- 성공 `200`: 식당 상세 정보
- 없음 `404`

식당 데이터는 공개 전에 실제 정보와 이미지 사용 권한을 검증해야 합니다. 확인되지 않은 가게 정보를 운영 데이터로 넣지 않습니다.

### 관심 식당

아래 API는 모두 인증이 필요합니다.

- `GET /saved-places`: 현재 사용자의 저장 목록과 식당 정보
- `POST /saved-places/:placeId`: 새 저장 `201`, 기존 또는 복구 `200`
- `DELETE /saved-places/:placeId`: 소프트 삭제 `204`, 저장 항목 없음 `404`

### 고객 관리 API 상태

Customer 모델, 라우터, 입력 검증 테스트는 보존되어 있습니다. 다만 고객 정보가 외부에 공개되지 않도록 `/customers`는 현재 앱에서 비활성 상태이며 요청하면 `404`를 반환합니다. 관리자 인증을 별도로 설계한 뒤에만 다시 연결합니다.

## 오류 형식

클라이언트가 바로 표시할 수 있도록 오류는 같은 형식을 사용합니다.

```json
{
  "message": "로그인이 필요합니다."
}
```

주요 상태 코드는 `400` 입력 오류, `401` 인증 오류, `404` 리소스 없음, `409` 중복, `500` 서버 오류입니다.

## 검증

```powershell
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

테스트는 데이터베이스 없이 입력 검증, 비밀번호 해시, JWT 서명·만료, 기본 라우팅과 JSON 오류 응답을 확인합니다.

## Vercel 준비

`api/index.ts`가 Vercel Function용 Express 앱을 내보내고, `src/server.ts`는 로컬 실행만 담당합니다. `vercel.json`은 모든 API 경로를 해당 함수로 전달합니다. 설치 시 `prisma generate`가 실행되도록 `postinstall`도 설정했습니다.

실제 배포 전에는 다음 순서를 지킵니다.

1. 연결 풀링을 지원하는 운영 PostgreSQL을 준비합니다.
2. Vercel에 `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_ORIGIN`을 등록합니다.
3. 운영 DB에 `npm.cmd run db:deploy`와 `npm.cmd run db:seed`를 실행합니다.
4. 백엔드 배포 후 `/health`, 인증, 식당 조회, 저장 흐름을 확인합니다.
5. 프론트의 `VITE_API_BASE_URL`을 배포된 백엔드 주소로 설정하고 다시 배포합니다.

비밀값과 `.env`는 GitHub에 올리지 않습니다.
