# 📈 다올리 (Daolly)

> **세탁소, 수리점, 공방 사장님을 위한 고객 및 매출 관리 프로그램**  

---

## 🌟 개요

**다올리(Daolly)**는 "맡기고-작업하고-찾아가는" 공정 관리가 필수적인 **접수형 서비스업**에 최적화된 고객 및 매출 관리 데스크톱 앱입니다.  
동네 세탁소, 수선집, 사설 수리점, 주문 제작 공방 등에서 복잡한 수기 장부나 무거운 프랜차이즈 POS 대신, 쉽고 빠르게 고객의 접수 건을 관리할 수 있습니다.

로컬 SQLite 기반으로 제작되어 모든 데이터는 사장님의 컴퓨터에만 안전하게 보관되며, 인터넷 연결 없이도 빠른 속도를 보장합니다.

## ✨ 주요 기능

* **👥 고객 및 관리**: 고객별 접수 히스토리 확인 및 미수금(외상) 현황 즉시 파악
* **🛒 접수 관리 (POS)**: 품목 선택, 작업 메모 입력, 결제 수단(카드/현금/이체/외상) 관리
* **🛠 공정 상태 추적**: '접수 → 작업 완료 → 인도(출고)'로 이어지는 상태 관리로 누락 방지
* **📉 매출 및 통계**: 기간별 매출 집계와 미수금 정산 내역 확인 (대시보드 준비 중)
* **🌗 현대적인 UI/UX**: 다크 모드 지원 및 직관적인 디자인으로 기기 숙련도와 상관없이 바로 사용 가능


## 🛠 기술 스택

* **Frontend**: React 19, Tailwind CSS, Zustand
* **Backend**: Rust (Tauri v2)
* **Database**: SQLite (Entity Framework Core 스타일의 Local DB 로직)
* **Icons**: Lucide React

## 🚀 시작하기

### 설치 및 사용

[Releases](https://github.com/gudtldn/daolly/releases) 페이지에서 본인의 운영체제에 맞는 설치 파일(`.msi`, `.dmg`)을 다운로드하여 실행하세요.

### 개발자 가이드

```bash
# 레포지토리 클론
git clone https://github.com/gudtldn/daolly.git

# 의존성 설치
npm install

# 개발 모드 실행
npm run tauri dev
```

### 배포 절차

1. **리허설**: 가게 PC에서 프로그램을 끈 뒤 `daolly.db`를 복사하고(위치는 환경 설정 > 데이터 관리의
   '데이터베이스 위치'), 가게와 같은 한국 시간대의 PC에서 이번 버전의 마이그레이션을 사본에 적용해 봅니다.
   지정한 사본은 다시 임시 폴더로 복사해서 쓰므로 바뀌지 않습니다.
   ```powershell
   cd src-tauri
   $env:DAOLLY_REHEARSAL_DB="C:\rehearsal\daolly.db"; cargo test rehearsal -- --ignored --nocapture
   ```
   - 건수·금액 합계가 전후 같고, 무결성 검사를 통과하고, 이번 업데이트로 새로 끊어진 연결(외래 키 위반)이
     없어야 합니다. (실패하면 배포하지 않습니다)
   - '확인할 데이터'(외상으로 기록된 결제, 초과 결제 등)와 '부모 없는 행'(예전부터 연결이 끊겨 있던 기록.
     업데이트해도 그대로 둠), 최근 14일 합계를 가게 장부와 비교합니다.
   - 출력에는 건수·금액·날짜·번호만 있고 고객 이름·전화번호는 없습니다.
2. `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`의 버전을 올리고 `v*` 태그를 push합니다.
3. Release 워크플로가 CI(타입 검사·테스트·린트)를 먼저 실행하고, 통과하면 **드래프트 릴리스**를 만듭니다.
4. 드래프트의 설치 파일을 직접 설치해 실제 데이터 사본으로 기동·마이그레이션을 확인합니다.
5. 확인이 끝나면 드래프트를 게시합니다. 게시한 뒤에야 설치된 앱의 자동 업데이트에 노출됩니다.

### 사용 기록 (개선할 곳 찾기)

프로그램을 어떻게 쓰는지 가게 PC의 로그 폴더에만 남깁니다. 밖으로 보내지 않으며, 필요하면
환경 설정 > 앱 정보 > **기록 내보내기**로 오류 로그(`daolly.log*`)와 함께 zip 파일 하나로 받습니다.
(Windows 위치: `%LOCALAPPDATA%\dev.gudtldn.daolly\logs`)

- `usage/usage-YYYY-MM-DD.jsonl`: 한 줄에 기록 하나. 지난 날짜는 `.jsonl.gz`로 압축하고, 전체가 500MB를 넘으면 오래된 날부터 지웁니다.
- 공통 필드: `t`(현지 시각), `sid`(실행마다 바뀌는 번호), `screen`(당시 화면), `e`(종류)

| `e` | 내용 |
|---|---|
| `app.start` / `app.resize` | 버전, 창·화면 크기, 배율 |
| `app.idle` / `app.active` | 5분 넘게 입력이 없음 / 다시 쓰기 시작 (`idleMin`) |
| `app.focus` / `app.blur` | 다른 프로그램으로 갔다 옴 |
| `screen` | 화면 이동 (`from`, `to`, 직전 화면에 머문 `stayedSec`) |
| `click` / `click.rapid` | 누른 요소 (`kind`, `label`) / 같은 곳을 0.7초 안에 3번 |
| `click.none` | 누를 수 없는 곳을 누름 (표 칸이면 열 제목 `column`) |
| `key` | Enter·Esc·Tab·F키·Ctrl 조합 등 (`on`: 어느 칸에서) |
| `cmd` | 명령 이름, 처리 시간 `ms`, 결과 수 `n`, 실패 `code`·`err`, 인자 요약 `args` |
| `dialog.open` / `dialog.close` | 확인 창 제목, 응답 `result`, 고민한 시간 `sec` |
| `error` | 화면 오류가 난 곳 (자세한 내용은 `daolly.log`) |

고객 이름·전화번호·금액·입력한 글자는 남기지 않습니다. 입력칸은 값 대신 안내 문구로, 숫자는 `#`으로,
명령 인자는 `search=digits:4`처럼 종류와 길이로만 남깁니다. 고객 정보를 글자로 보여 주는 버튼이나 행을
새로 만들면 `data-track="이름"`을 달아 주세요. (`src/utils/usage.ts`)

## 📄 라이선스

이 프로젝트는 [MIT License](LICENSE)를 따릅니다. 누구나 자유롭게 코드를 확인하고 기여할 수 있습니다.

---
**Built with AI**:

* 주로 디자인에 Gemini Pro 3.1
* 구현 및 코드 리뷰에 Claude Sonnet 4.6
* 심층 리뷰에 Claude Opus 4.6의 도움을 받아 제작되었습니다.
