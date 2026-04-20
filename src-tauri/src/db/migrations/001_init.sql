-- ==============================================================================
-- 1. 마스터 데이터 영역 (환경 설정 - 단가표 관리용)
-- ==============================================================================

-- 카테고리 (예: 상의, 하의, 아우터)
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- 품목 단가표 (예: 와이셔츠 2000원)
CREATE TABLE IF NOT EXISTS price_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  default_price INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_price_items_category ON price_items(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_items_cat_name ON price_items(category_id, name);


-- ==============================================================================
-- 2. 고객 및 영업(접수) 영역
-- ==============================================================================

-- 고객 정보
CREATE TABLE IF NOT EXISTS customers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  phone_number     TEXT,
  note             TEXT,
  created_at       TEXT    NOT NULL,
  last_modified_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_name  ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number);

-- 접수 단위 (세탁물 접수 단위 1건)
CREATE TABLE IF NOT EXISTS work_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id      INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status           TEXT    NOT NULL DEFAULT 'Received',
  description      TEXT    NOT NULL,
  price            INTEGER NOT NULL DEFAULT 0,
  paid_amount      INTEGER NOT NULL DEFAULT 0,
  note             TEXT,
  received_at      TEXT    NOT NULL,
  completed_at     TEXT,
  picked_up_at     TEXT,
  created_at       TEXT    NOT NULL,
  last_modified_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_work_items_customer ON work_items(customer_id);
CREATE INDEX IF NOT EXISTS idx_work_items_status   ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_received ON work_items(received_at);

-- 접수 상세 품목 (영수증 내역 및 품목별 통계용)
CREATE TABLE IF NOT EXISTS work_item_details (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id  INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  item_name     TEXT    NOT NULL,
  unit_price    INTEGER NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  options_memo  TEXT
);
CREATE INDEX IF NOT EXISTS idx_work_item_details_wi ON work_item_details(work_item_id);


-- ==============================================================================
-- 3. 결제 영역
-- ==============================================================================

-- 결제 내역 (부분 결제, 다중 결제 지원)
CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id  INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,
  method        TEXT,
  paid_at       TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_work_item ON payments(work_item_id);
