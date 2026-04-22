# 📈 다올리 (Daolly)

> **자영업 사장님들을 위한 직관적인 고객 및 매출 관리 프로그램**  

---

## 🌟 개요

**다올리(Daolly)**는 개인 사업장에서 복잡한 장부 정리 대신 디지털로 쉽고 빠르게 고객 정보와 매출을 관리할 수 있도록 돕는 데스크톱 앱입니다.  
WinForms 기반의 기존 시스템에서 Tauri v2와 React를 활용한 현대적인 환경으로 마이그레이션 중이며, 로컬 데이터 보관을 통해 보안과 속도를 챙겼습니다.

## ✨ 주요 기능

* **👥 고객 관리**: 단골 손님 목록 및 상세 정보 관리, 미수금 현황 파악
* **🛒 간편 접수 (POS)**: 품목 선택 및 메모 입력을 통한 빠른 주문 접수 및 결제 처리
* **📉 매출 통계**: 기간별 매출 집계 및 거래 내역 조회 (대시보드 준비 중)
* **🚀 자동 업데이트**: 프로그램 실행 시 GitHub Release를 통한 최신 버전 자동 유지
* **🌗 다크 모드**: 사용자 취향에 맞는 시스템 테마 연동 및 모드 지원

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

## 📄 라이선스

이 프로젝트는 [MIT License](LICENSE)를 따릅니다. 누구나 자유롭게 코드를 확인하고 기여할 수 있습니다.

---
**Built with AI**:

* 주로 디자인에 Gemini Pro 3.1
* 구현 및 코드 리뷰에 Claude Sonnet 4.6
* 심층 리뷰에 Claude Opus 4.6의 도움을 받아 제작되었습니다.
