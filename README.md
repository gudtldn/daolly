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

## 📄 라이선스

이 프로젝트는 [MIT License](LICENSE)를 따릅니다. 누구나 자유롭게 코드를 확인하고 기여할 수 있습니다.

---
**Built with AI**:

* 주로 디자인에 Gemini Pro 3.1
* 구현 및 코드 리뷰에 Claude Sonnet 4.6
* 심층 리뷰에 Claude Opus 4.6의 도움을 받아 제작되었습니다.
