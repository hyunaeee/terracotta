# Terracotta 운영 배포

## 개인 Vercel 배포

Vercel에서는 `npm run build:vercel`로 Next.js를 빌드합니다. Production 환경에 Turso 데이터베이스를 연결하면 대화와 프로젝트가 새 배포에도 유지됩니다. 가든은 같은 주소로 접속한 브라우저의 로컬 저장소에 보관됩니다.

| Production 환경 변수 | 용도 |
| --- | --- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Vercel에서 Turso 데이터베이스를 연결하면 제공됩니다. |
| `TERRACOTTA_VERCEL_CLIENT_ID`, `TERRACOTTA_VERCEL_OWNER_ID` | Sign in with Vercel 앱의 Client ID와 작업실에 접근할 Vercel 사용자의 고유 ID입니다. |
| `TERRACOTTA_OWNER_PASSWORD` | Vercel 로그인 설정을 생략하고 비밀번호 방식으로 직접 운영할 때 설정합니다. 무작위 32바이트를 base64url로 인코딩합니다. |
| `MCP_TOKEN_ENCRYPTION_KEY` | MCP 연결 정보를 보호하는 키입니다. 무작위 32바이트를 base64로 인코딩해 설정하고 배포 간에 같은 값을 유지합니다. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY` | 실제 AI 대화에 사용할 공급사의 키를 설정합니다. |

Vercel의 **Settings → Environments → Production → Branch Tracking**에서 운영 브랜치를 확인할 수 있습니다. 연결된 GitHub 저장소의 해당 브랜치에 푸시하면 빌드가 성공한 후 같은 운영 주소에 반영됩니다. 환경 변수만 바꾼 경우에는 Production을 다시 배포하세요. 로그인 후 `/api/health`에서 데이터베이스 연결을 확인할 수 있습니다.

개인 팀의 **Settings → Apps**에서 Sign in with Vercel 앱을 등록합니다. 인증 방식은 `none`, 범위는 `openid`로 설정하고 운영 주소 뒤에 `/owner/callback`을 붙여 콜백 URL로 등록합니다. [Vercel 앱 설정 안내](https://vercel.com/docs/sign-in-with-vercel/manage-from-dashboard)

운영 주소를 열면 Vercel 로그인으로 이동합니다. 로그인한 사용자의 고유 ID가 설정값과 일치하면 개인 작업실이 열립니다. 브라우저 세션은 서명된 ID 토큰의 만료 시점까지, 최대 한 시간 동안 유지됩니다. `/owner/logout`에서 로그아웃할 수 있습니다.

## Docker 배포

Docker가 앱과 영구 D1 데이터를 실행하고, Caddy가 도메인의 HTTPS 인증서를 자동으로 관리하며, GitHub 로그인이 팀원 이메일을 Terracotta 권한 시스템에 전달합니다.

## 준비물

- 도메인 1개
- Docker가 설치된 Linux 서버(VPS, NAS, 홈 서버 등)
- GitHub OAuth App
- 사용할 AI 공급사 API 키

도메인의 `A` 레코드를 서버 공인 IP로 연결하고 서버 방화벽에서 TCP 80·443과 UDP 443을 허용합니다. 앱 컨테이너의 8080 포트는 외부로 공개되지 않습니다.

## GitHub 로그인 만들기

GitHub의 **Settings → Developer settings → OAuth Apps → New OAuth App**에서 다음 값을 사용합니다.

- Homepage URL: `https://내도메인`
- Authorization callback URL: `https://내도메인/oauth2/callback`

생성된 Client ID와 Client Secret을 아래 환경 파일에 넣습니다. `TERRACOTTA_GITHUB_USERS`에는 로그인할 본인과 팀원의 GitHub 사용자명을 쉼표로 나열합니다.

## 서버에서 실행

```bash
git clone https://github.com/hyunaeee/terracotta.git
cd terracotta
cp .env.production.example .env.production
openssl rand -base64 32 | tr -- '+/' '-_'
```

마지막 명령의 값을 `OAUTH2_PROXY_COOKIE_SECRET`에 넣고 나머지 빈 값을 채운 다음 실행합니다.

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d --build
```

`https://내도메인`에 접속해 GitHub로 로그인하면 됩니다. Caddy가 인증서를 자동으로 발급·갱신하고, 데이터·MCP 토큰·작업 기록은 Docker 볼륨에 유지됩니다.

## Windows 또는 macOS 컴퓨터 연결

배포된 Terracotta의 **로컬 터미널** 화면에서 컴퓨터 이름을 입력하고 연결 키를 만듭니다. 화면에 표시되는 두 줄을 PowerShell 또는 macOS Terminal에 붙여넣으면 로컬 에이전트가 운영 사이트로 아웃바운드 연결됩니다. 공유기 포트 개방은 필요하지 않습니다.

모델이 로컬 명령을 제안해도 다음 순서를 모두 통과해야 실행됩니다.

1. 채팅에서 명령·작업 폴더 확인
2. 사용자 승인
3. 연결 키 소유자와 작업 소유자 일치 확인
4. 로컬 에이전트의 작업 폴더 경계와 위험 명령 검사
5. 제한 시간·출력 크기 안에서 비대화형 실행

에이전트를 종료하면 해당 컴퓨터는 즉시 오프라인이 됩니다. 연결 키를 폐기하려면 **로컬 터미널 → 연결 해제**를 누릅니다.

## 업데이트

```bash
git pull
docker compose --env-file .env.production -f compose.production.yaml up -d --build
```

## 백업

```bash
docker run --rm \
  -v terracotta-production_terracotta-data:/data \
  -v "${PWD}:/backup" \
  alpine tar czf /backup/terracotta-backup.tgz -C /data .
```

`terracotta-data`와 `.env.production`을 별도로 보관하세요. `.env.production`은 Git에 커밋하면 안 됩니다.
