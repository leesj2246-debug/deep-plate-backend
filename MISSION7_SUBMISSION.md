# Deep Plate 미션 7 제출 준비서

최종 갱신: 2026-09-01

## 제출 주소

- GitHub 저장소: 배포 직전 입력
- 프론트엔드 URL: 배포 직전 입력
- 백엔드 API URL: 배포 직전 입력

현재 코드는 로컬에서 완성·검증했지만, 최신 변경은 아직 공개 GitHub와 Vercel에 올리지 않았습니다.

## 기본 요구사항 대응

1. 백엔드 기능 범위
   - JWT 회원가입·로그인·현재 사용자 확인
   - 실제 식당 목록·상세 조회
   - 로그인 사용자별 관심 식당 저장·조회·소프트 삭제
2. REST API
   - `POST /auth/register`
   - `POST /auth/login`
   - `GET /auth/me`
   - `GET /places`
   - `GET /places/:slug`
   - `GET /saved-places`
   - `POST /saved-places/:placeId`
   - `DELETE /saved-places/:placeId`
3. 데이터 저장
   - PostgreSQL + Prisma
   - `User`, `Restaurant`, `SavedPlace`, `Customer`
   - 삭제는 `deletedAt`을 기록하고 재저장 시 기존 관심 식당 행을 복구
4. 프론트엔드 연동
   - Mock Data 배열 제거
   - API 응답 기반 목록·상세·로그인·저장 화면
   - 로딩·빈 목록·오류 메시지 처리
5. 배포 준비
   - Vercel Function 진입점 `api/index.ts`
   - 환경 변수 예시와 전체 경로 rewrite 설정
   - 운영 DB 마이그레이션·환경 변수 등록은 실제 배포 단계에서 진행

## 심화 요구사항 대응

- JWT 인증과 보호 API 적용
- 이메일·비밀번호·검색 조건 입력값 검증
- 일관된 JSON 오류 형식과 HTTP 상태 코드
- `.env`와 `.env.example` 분리
- README에 요청·응답·실행·배포 방법 문서화

## 실제 검증 결과

- Prisma 스키마 검증: 통과
- PostgreSQL 마이그레이션 2개: 최신 상태
- 백엔드 타입 검사·빌드: 통과
- 백엔드 자동 테스트: 11개 통과
- 프론트엔드 lint·타입 검사·빌드: 통과
- 프론트엔드 자동 테스트: 12개 통과
- 브라우저 통합 확인: 목록 3곳 → 문화옥 상세·공식 출처 → 로그인 → 저장 → 저장 목록 → 저장 해제 통과
- 브라우저 콘솔 경고·오류: 없음

검증용 사용자와 관심 식당 데이터는 확인 후 삭제했습니다.

## 배포 직전 체크

- [ ] 백엔드 GitHub 저장소를 Public으로 생성하고 비밀값 누락 여부 확인
- [ ] 운영 PostgreSQL 준비 및 `DATABASE_URL` 등록
- [ ] 32자 이상 운영 `JWT_SECRET` 등록
- [ ] 프론트 주소를 백엔드 `FRONTEND_ORIGIN`에 등록
- [ ] 운영 DB에 `db:deploy`, `db:seed` 실행
- [ ] 백엔드 `/health`와 전체 인증·저장 흐름 확인
- [ ] 프론트 `VITE_API_BASE_URL`을 운영 API 주소로 설정
- [ ] 프론트 Vercel 배포와 직접 경로 접속 확인
- [ ] 최종 GitHub URL·배포 URL을 이 문서와 제출란에 입력
