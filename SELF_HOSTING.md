# Terracotta 셀프호스팅

Terracotta는 현재 웹 버전과 같은 Worker 앱을 Docker 안에서 실행할 수 있습니다. 모델 설정, 사용량 원장, 오케스트레이션 기록과 MCP 연결은 `terracotta-data` 볼륨의 로컬 D1에 저장됩니다.

## 5분 설치

필요한 것은 Docker Desktop 또는 Docker Engine과 Compose 플러그인뿐입니다.

```bash
git clone https://github.com/hyunaeee/terracotta.git
cd terracotta
cp .env.selfhost.example .env
docker compose up -d --build
```

Windows PowerShell에서는 세 번째 줄을 다음처럼 실행하세요.

```powershell
Copy-Item .env.selfhost.example .env
```

이제 [http://localhost:3000](http://localhost:3000)을 열면 됩니다. 모델 키를 아직 넣지 않았어도 UI와 가든은 열리며, 실제 AI 작업을 실행할 때만 연결된 공급사 키가 필요합니다.

## 모델 연결

`.env`에서 원하는 공급사만 채우고 컨테이너를 다시 올리세요.

```dotenv
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
PERPLEXITY_API_KEY=
TERRACOTTA_MONTHLY_BUDGET_USD=24
```

```bash
docker compose up -d
```

API 키는 브라우저 코드에 포함되지 않고 Worker 런타임 바인딩으로 전달됩니다. `MCP_TOKEN_ENCRYPTION_KEY`를 비워 두면 첫 실행에 32바이트 키를 자동으로 만들고 데이터 볼륨에 보관합니다. 이미 MCP를 연결한 뒤에는 그 키나 데이터 볼륨을 삭제하지 마세요.

## 프로젝트와 내 컴퓨터 연결

Terracotta 웹앱은 Docker 안에서 실행되므로 호스트나 다른 컴퓨터의 프로젝트 폴더를 임의로 볼 수 없습니다. 대신 UI의 **로컬 터미널 → 새 컴퓨터 연결**에서 일회용 연결 명령을 만들고, 접근을 허용할 폴더에서 그 명령을 실행합니다. Windows는 PowerShell, macOS는 zsh, Linux는 bash를 자동 선택합니다.

연결한 뒤 **프로젝트 → 새 프로젝트**에서 다음을 지정합니다.

- 연결할 컴퓨터와 그 에이전트 workspace 안의 상대 루트 경로
- 프로젝트 기본 모델과 GPT/Claude/Gemini 공용 작업 지침
- `읽기 전용` 또는 `읽기·쓰기` 파일 권한
- `터미널 사용 안 함` 또는 `실행 전 승인` 정책

파일 목록·읽기·검색·Git 변경점 확인은 구조화된 작업으로 실행됩니다. 파일 저장은 UI에서 사용자가 직접 저장하거나 대화 중 표시된 승인 카드를 승인했을 때만 실행됩니다. 일반 터미널 명령도 항상 승인 후 실행됩니다.

보안 경계는 프로젝트 설정의 폴더가 아니라 로컬 에이전트를 시작할 때 지정한 `--workspace`입니다. 에이전트는 절대 경로, `..` 탈출, workspace 밖 심볼릭 링크와 시스템 수준·파괴적 명령을 거부합니다. 따라서 홈 디렉터리 전체보다 실제 개발 프로젝트들의 공통 상위 폴더처럼 필요한 범위만 연결하세요.

## 데이터와 백업

아래 데이터는 `terracotta-data` Docker 볼륨에 남습니다.

- 로컬 D1 데이터베이스
- 모델 우선순위와 사용량 원장
- 프로젝트별 대화·작업 지침·컴퓨터 연결 설정과 파일 작업 기록
- 오케스트레이션 실행·승인 기록
- 암호화된 MCP OAuth 토큰과 토큰 암호화 키

현재 폴더에 백업 파일을 만들려면 다음을 실행하세요.

```bash
docker run --rm -v terracotta-data:/data -v "${PWD}:/backup" alpine \
  tar czf /backup/terracotta-backup.tgz -C /data .
```

## 업데이트

소스에서 직접 실행하는 경우:

```bash
git pull
docker compose up -d --build
```

GitHub Container Registry의 빌드된 이미지만 쓰는 경우:

```bash
docker compose pull
docker compose up -d --no-build
```

운영 환경에서는 `TERRACOTTA_VERSION=latest` 대신 릴리스 태그를 고정하는 편이 안전합니다.

## 상태 확인과 로그

```bash
docker compose ps
docker compose logs -f terracotta
```

`/api/health`는 앱과 로컬 D1을 함께 검사합니다. 컨테이너가 `healthy`이면 두 구성요소 모두 요청을 받을 수 있는 상태입니다.

## 외부 공개 전 보안

기본값은 `127.0.0.1:3000`이라 이 컴퓨터에서만 접속할 수 있습니다. 기본 셀프호스트판은 안전을 위해 모든 요청을 한 명의 `owner`로 처리합니다. 팀 공유를 사용하거나 인터넷·사내망에 공개하려면 다음을 먼저 준비하세요.

- HTTPS 리버스 프록시
- 프록시 단계의 로그인 또는 SSO
- 방화벽과 접근 허용 목록
- 정기적인 `terracotta-data` 백업

로그인 프록시는 외부 요청에 포함된 `oai-authenticated-user-email` 헤더를 반드시 제거한 뒤, 인증이 끝난 사용자 이메일만 같은 이름의 헤더로 새로 넣어야 합니다. 이 조건을 충족할 때만 다음처럼 설정하세요.

```dotenv
TERRACOTTA_BIND=0.0.0.0
TERRACOTTA_TRUST_AUTH_HEADERS=true
```

`TERRACOTTA_TRUST_AUTH_HEADERS=false` 상태에서는 클라이언트가 임의 이메일 헤더를 보내도 무시합니다. 인증 프록시 없이 이 값을 `true`로 바꾸지 마세요.

## 중지

```bash
docker compose down
```

이 명령은 데이터 볼륨을 보존합니다. `docker compose down -v`는 저장된 가든, 설정, 기록과 MCP 키를 모두 지우므로 백업 없이 실행하지 마세요.
