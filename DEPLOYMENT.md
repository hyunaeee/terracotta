# Terracotta 운영 배포

이 배포판은 `chatgpt.site`와 분리된 독립 웹 서비스입니다. Docker가 앱과 영구 D1 데이터를 실행하고, Caddy가 도메인의 HTTPS 인증서를 자동으로 관리하며, GitHub 로그인이 팀원 이메일을 Terracotta 권한 시스템에 전달합니다.

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
