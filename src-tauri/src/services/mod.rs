//! 비즈니스 로직 추상 계층
//! Commands(Tauri 진입점) -> Services(여기) -> Entities(DB) 순으로 호출합니다.
//! 입력 검증, 트랜잭션 관리, 집계 로직을 담당합니다.

pub mod categories;
pub mod customers;
pub mod migration;
pub mod payments;
pub mod price_items;
pub mod price_options;
pub mod price_settings;
pub mod sales;
pub mod work_items;
