# PERSONAL FINANCE MANAGER PRO — DATABASE SCHEMA & API SPECIFICATION

เอกสารนี้อธิบายโครงสร้างฐานข้อมูล Google Sheets ทั้ง 16 ชีต และรูปแบบ REST API ของ Google Apps Script (Standalone Backend)

---

## 1. Google Sheets Database Schema (16 Sheets)

ทุกตารางถูกสร้างและตรวจสอบหัวคอลัมน์อัตโนมัติผ่านฟังก์ชัน `setupDatabase()` ในไฟล์ `backend/Setup.gs`

### 1.1 `Users`
เก็บข้อมูลผู้ใช้งานและการยืนยันตัวตน (Email + Password Hash + PIN Hash)
| Column | Name | Type | Description |
|---|---|---|---|
| A | `user_id` | String (UUID) | รหัสผู้ใช้หลัก (`usr_...`) |
| B | `email` | String | อีเมลผู้ใช้ (Unique, Lowercase) |
| C | `password_hash` | String | SHA-256 HMAC Hash พร้อม Salt |
| D | `pin_hash` | String | SHA-256 HMAC Hash สำหรับ PIN 6 หลัก (Optional) |
| E | `salt` | String | Random Salt เฉพาะรายผู้ใช้ |
| F | `full_name` | String | ชื่อที่แสดงผล |
| G | `base_currency` | String | สกุลเงินหลัก เช่น `THB`, `USD` |
| H | `timezone` | String | เช่น `Asia/Bangkok` |
| I | `role` | String | `user` หรือ `admin` |
| J | `status` | String | `active`, `locked`, `suspended` |
| K | `failed_attempts` | Number | จำนวนครั้งที่ใส่รหัสผิดต่อเนื่อง |
| L | `locked_until` | ISO Timestamp | เวลาปลดล็อกหากใส่รหัสผิดเกินกำหนด |
| M | `session_token_hash` | String | Hash ของ Session Token ปัจจุบัน |
| N | `session_expires_at` | ISO Timestamp | วันหมดอายุของ Session Token |
| O | `created_at` | ISO Timestamp | เวลาที่สร้างบัญชี |
| P | `updated_at` | ISO Timestamp | เวลาที่แก้ไขล่าสุด |

### 1.2 `Accounts`
เก็บข้อมูลบัญชีการเงินทุกประเภท (เงินสด, ธนาคาร, E-Wallet, บัตรเครดิต, บัญชีลงทุน)
| Column | Name | Type | Description |
|---|---|---|---|
| A | `account_id` | String | รหัสบัญชี (`acc_...`) |
| B | `user_id` | String | เจ้าของบัญชี |
| C | `account_name` | String | ชื่อบัญชี |
| D | `account_type` | String | `cash`, `bank`, `ewallet`, `credit_card`, `investment` |
| E | `currency` | String | `THB`, `USD`, `EUR`, `JPY`, ฯลฯ |
| F | `opening_balance` | Number | ยอดเงินตั้งต้น |
| G | `current_balance` | Number | ยอดเงินปัจจุบันที่คำนวณจากธุรกรรมจริง |
| H | `credit_limit` | Number | วงเงินบัตรเครดิต (เฉพาะ `credit_card`) |
| I | `billing_day` | Number | วันสรุปยอดบัตรเครดิต (1-31) |
| J | `due_day` | Number | วันครบกำหนดชำระ (1-31) |
| K | `institution_name` | String | ชื่อธนาคาร/สถาบันการเงิน |
| L | `account_number_masked` | String | เลขท้ายบัญชี เช่น `xxxx-1234` (ห้ามเก็บเลขเต็มหรือ PIN) |
| M | `color` | String | Hex Color สำหรับแสดงผล |
| N | `icon` | String | ชื่อไอคอน |
| O | `include_in_net_worth` | Boolean | รวมในคำนวณมูลค่าสุทธิหรือไม่ (`TRUE`/`FALSE`) |
| P | `is_archived` | Boolean | ปิดการใช้งานชั่วคราว (`TRUE`/`FALSE`) |
| Q | `last_reconciled_at` | ISO Timestamp | เวลาที่กระทบยอดล่าสุด |
| R | `created_at` | ISO Timestamp | เวลาสร้าง |
| S | `updated_at` | ISO Timestamp | เวลาแก้ไขล่าสุด |

### 1.3 `Categories`
เก็บหมวดหมู่หลักและหมวดหมู่ย่อยของแต่ละผู้ใช้
| Column | Name | Type | Description |
|---|---|---|---|
| A | `category_id` | String | รหัสหมวดหมู่ (`cat_...`) |
| B | `user_id` | String | เจ้าของหมวดหมู่ (`SYSTEM` หรือ `usr_...`) |
| C | `parent_id` | String | รหัสหมวดหมู่หลัก (ว่างถ้าเป็นหมวดหมู่หลัก) |
| D | `category_name` | String | ชื่อหมวดหมู่ |
| E | `category_type` | String | `income`, `expense`, `transfer`, `adjustment` |
| F | `color` | String | รหัสสี Hex |
| G | `icon` | String | ชื่อไอคอน |
| H | `is_system` | Boolean | หมวดหมู่เริ่มต้นของระบบหรือไม่ |
| I | `is_active` | Boolean | สถานะเปิดใช้งาน |
| J | `created_at` | ISO Timestamp | เวลาสร้าง |
| K | `updated_at` | ISO Timestamp | เวลาแก้ไขล่าสุด |

### 1.4 `Transactions`
เก็บรายการธุรกรรมทั้งหมด (รายรับ, รายจ่าย, โอนเงิน, คืนเงิน, ปรับยอด)
| Column | Name | Type | Description |
|---|---|---|---|
| A | `transaction_id` | String | รหัสธุรกรรม (`txn_...`) |
| B | `user_id` | String | เจ้าของข้อมูล |
| C | `tx_date` | String (YYYY-MM-DD) | วันที่เกิดรายการ |
| D | `tx_time` | String (HH:mm) | เวลาที่เกิดรายการ |
| E | `tx_type` | String | `income`, `expense`, `transfer`, `refund`, `adjustment` |
| F | `account_id` | String | บัญชีต้นทาง (หรือบัญชีหลัก) |
| G | `to_account_id` | String | บัญชีปลายทาง (เฉพาะ `transfer`) |
| H | `category_id` | String | หมวดหมู่หลัก |
| I | `subcategory_id` | String | หมวดหมู่ย่อย |
| J | `amount` | Number | จำนวนเงิน (ค่าบวกเสมอสำหรับ `income`/`expense`/`transfer`/`refund`, บวกหรือลบสำหรับ `adjustment`) |
| K | `currency` | String | สกุลเงินของบัญชีต้นทาง |
| L | `exchange_rate` | Number | อัตราแลกเปลี่ยนเทียบ Base Currency (ค่าเริ่มต้น `1`) |
| M | `to_amount` | Number | จำนวนเงินเข้าบัญชีปลายทาง (กรณีโอนข้ามสกุลเงิน) |
| N | `merchant` | String | ร้านค้า / ผู้รับเงิน / แหล่งที่มา |
| O | `description` | String | รายละเอียด / หมายเหตุ |
| P | `tags` | String | แท็กคั่นด้วยจุลภาค เช่น `food,work` |
| Q | `receipt_url` | String | ลิงก์เอกสาร/ใบเสร็จ (Google Drive / URL) |
| R | `reference_tx_id` | String | อ้างอิงรายการเดิม (เช่น `refund` อ้างอิง `expense`, หรือการจ่ายบิลบัตรเครดิต) |
| S | `recurring_id` | String | อ้างอิง `recurring_id` หากสร้างจากระบบอัตโนมัติ |
| T | `import_id` | String | อ้างอิง `import_id` หากนำเข้าจาก CSV |
| U | `idempotency_key` | String | คีย์ป้องกันการส่งคำขอซ้ำจาก Client |
| V | `dedup_hash` | String | Hash ตรวจสอบรายการซ้ำ (`date+type+account+amount+merchant`) |
| W | `status` | String | `posted`, `pending`, `voided` |
| X | `revision` | Number | เลขครั้งการแก้ไข (เริ่มที่ 1) |
| Y | `edit_history_json` | JSON String | ประวัติการแก้ไขและยกเลิกรายการ |
| Z | `created_at` | ISO Timestamp | เวลาสร้าง |
| AA | `updated_at` | ISO Timestamp | เวลาแก้ไขล่าสุด |

### 1.5 `Budgets`
| Column | Name | Type | Description |
|---|---|---|---|
| A | `budget_id` | String | รหัสงบประมาณ (`bdg_...`) |
| B | `user_id` | String | เจ้าของข้อมูล |
| C | `budget_name` | String | ชื่องบประมาณ |
| D | `period_type` | String | `daily`, `weekly`, `monthly`, `yearly` |
| E | `category_id` | String | รหัสหมวดหมู่ (`ALL` สำหรับงบรวม) |
| F | `amount_limit` | Number | วงเงินงบประมาณ |
| G | `currency` | String | สกุลเงิน |
| H | `start_date` | String | วันเริ่มต้น |
| I | `end_date` | String | วันสิ้นสุด (Optional) |
| J | `rollover_enabled` | Boolean | ยกยอดคงเหลือไปรอบถัดไปหรือไม่ |
| K | `rollover_amount` | Number | ยอดยกมาจากรอบก่อน |
| L | `alert_threshold_pct` | Number | เปอร์เซ็นต์แจ้งเตือน เช่น `80` |
| M | `is_active` | Boolean | สถานะการใช้งาน |
| N | `created_at` | ISO Timestamp | เวลาสร้าง |
| O | `updated_at` | ISO Timestamp | เวลาแก้ไขล่าสุด |

### 1.6 `Goals` (Savings Goals)
| Column | Name | Type | Description |
|---|---|---|---|
| A | `goal_id` | String | รหัสเป้าหมาย (`gol_...`) |
| B | `user_id` | String | เจ้าของข้อมูล |
| C | `goal_name` | String | ชื่อเป้าหมายการออม |
| D | `target_amount` | Number | ยอดเป้าหมาย |
| E | `current_amount` | Number | ยอดที่ออมได้แล้ว |
| F | `currency` | String | สกุลเงิน |
| G | `target_date` | String (YYYY-MM-DD) | วันครบกำหนดเป้าหมาย |
| H | `linked_account_id` | String | บัญชีที่ผูกไว้ (Optional) |
| I | `priority` | String | `high`, `medium`, `low` |
| J | `status` | String | `active`, `completed`, `paused`, `cancelled` |
| K | `color` | String | สีแสดงผล |
| L | `icon` | String | ไอคอน |
| M | `notes` | String | หมายเหตุ |
| N | `created_at` | ISO Timestamp | เวลาสร้าง |
| O | `updated_at` | ISO Timestamp | เวลาแก้ไขล่าสุด |

### 1.7 `Goal_Contributions`
| Column | Name | Type | Description |
|---|---|---|---|
| A | `contribution_id` | String | รหัสรายการ (`gct_...`) |
| B | `goal_id` | String | รหัสเป้าหมาย |
| C | `user_id` | String | เจ้าของข้อมูล |
| D | `tx_date` | String | วันที่เติม/ถอนเงิน |
| E | `entry_type` | String | `deposit`, `withdraw` |
| F | `amount` | Number | จำนวนเงิน |
| G | `linked_transaction_id` | String | รหัสธุรกรรมที่เชื่อมโยง (ถ้ามี) |
| H | `note` | String | หมายเหตุ |
| I | `created_at` | ISO Timestamp | เวลาสร้าง |

### 1.8 `Recurring`
| Column | Name | Type | Description |
|---|---|---|---|
| A | `recurring_id` | String | รหัสรายการประจำ (`rec_...`) |
| B | `user_id` | String | เจ้าของข้อมูล |
| C | `title` | String | ชื่อรายการประจำ |
| D | `tx_type` | String | `income`, `expense`, `transfer` |
| E | `account_id` | String | บัญชีต้นทาง |
| F | `to_account_id` | String | บัญชีปลายทาง |
| G | `category_id` | String | หมวดหมู่ |
| H | `amount` | Number | จำนวนเงิน |
| I | `currency` | String | สกุลเงิน |
| J | `frequency` | String | `daily`, `weekly`, `monthly`, `yearly` |
| K | `interval_count` | Number | ทุกๆ กี่รอบ (เช่น `1`) |
| L | `start_date` | String | วันเริ่มต้น |
| M | `end_date` | String | วันสิ้นสุด (Optional) |
| N | `next_run_date` | String | วันที่จะสร้างรายการครั้งถัดไป |
| O | `last_run_date` | String | วันที่สร้างรายการล่าสุด |
| P | `auto_post` | Boolean | สร้างธุรกรรมจริงอัตโนมัติหรือไม่ |
| Q | `status` | String | `active`, `paused`, `completed` |
| R | `created_at` | ISO Timestamp | เวลาสร้าง |
| S | `updated_at` | ISO Timestamp | เวลาแก้ไขล่าสุด |

### 1.9 `Debts`
| Column | Name | Type | Description |
|---|---|---|---|
| A | `debt_id` | String | รหัสหนี้สิน (`dbt_...`) |
| B | `user_id` | String | เจ้าของข้อมูล |
| C | `debt_name` | String | ชื่อหนี้สิน/สินเชื่อ |
| D | `debt_type` | String | `loan`, `mortgage`, `credit_card`, `personal`, `auto` |
| E | `lender_name` | String | เจ้าหนี้/สถาบันการเงิน |
| F | `linked_account_id` | String | บัญชีบัตรเครดิตหรือสินเชื่อที่ผูกกัน |
| G | `principal_amount` | Number | เงินต้นเริ่มต้น |
| H | `current_balance` | Number | ยอดหนี้คงเหลือ |
| I | `interest_rate_annual` | Number | อัตราดอกเบี้ยต่อปี (%) |
| J | `minimum_payment` | Number | ยอดชำระขั้นต่ำต่อเดือน |
| K | `due_day` | Number | วันครบกำหนดชำระของทุกเดือน |
| L | `start_date` | String | วันเริ่มสัญญา |
| M | `target_payoff_date` | String | วันคาดว่าจะหมดหนี้ |
| N | `status` | String | `active`, `paid_off` |
| O | `created_at` | ISO Timestamp | เวลาสร้าง |
| P | `updated_at` | ISO Timestamp | เวลาแก้ไขล่าสุด |

### 1.10 `Debt_Payments`
| Column | Name | Type | Description |
|---|---|---|---|
| A | `payment_id` | String | รหัสการชำระหนี้ (`dp_...`) |
| B | `debt_id` | String | รหัสหนี้สิน |
| C | `user_id` | String | เจ้าของข้อมูล |
| D | `payment_date` | String | วันที่ชำระ |
| E | `total_amount` | Number | ยอดชำระรวม |
| F | `principal_paid` | Number | ส่วนที่ตัดเงินต้น |
| G | `interest_paid` | Number | ส่วนที่เป็นดอกเบี้ย |
| H | `fee_amount` | Number | ค่าธรรมเนียม |
| I | `remaining_balance` | Number | ยอดคงเหลือหลังชำระ |
| J | `linked_transaction_id` | String | รหัสธุรกรรมโอน/จ่ายชำระ |
| K | `created_at` | ISO Timestamp | เวลาสร้าง |

### 1.11 `Bills`
| Column | Name | Type | Description |
|---|---|---|---|
| A | `bill_id` | String | รหัสบิล (`bil_...`) |
| B | `user_id` | String | เจ้าของข้อมูล |
| C | `bill_name` | String | ชื่อบิล |
| D | `category_id` | String | หมวดหมู่ |
| E | `amount` | Number | ยอดเงินที่ต้องชำระ |
| F | `currency` | String | สกุลเงิน |
| G | `due_date` | String | วันครบกำหนดชำระ |
| H | `is_recurring` | Boolean | เป็นบิลประจำหรือไม่ |
| I | `frequency` | String | `monthly`, `yearly`, `once` |
| J | `status` | String | `unpaid`, `paid`, `overdue`, `cancelled` |
| K | `remind_days_before` | Number | แจ้งเตือนล่วงหน้ากี่วัน |
| L | `paid_transaction_id` | String | อ้างอิงรหัสธุรกรรมเมื่อจ่ายแล้ว |
| M | `notes` | String | หมายเหตุ |
| N | `created_at` | ISO Timestamp | เวลาสร้าง |
| O | `updated_at` | ISO Timestamp | เวลาแก้ไขล่าสุด |

### 1.12 `Rules` (Smart Categorization & Automation Rules)
| Column | Name | Type | Description |
|---|---|---|---|
| A | `rule_id` | String | รหัสกฎ (`rul_...`) |
| B | `user_id` | String | เจ้าของข้อมูล |
| C | `rule_name` | String | ชื่อกฎอัตโนมัติ |
| D | `match_field` | String | `merchant`, `description`, `amount` |
| E | `match_operator` | String | `contains`, `equals`, `starts_with`, `gt`, `lt` |
| F | `match_value` | String | ค่าที่ใช้ตรวจสอบ |
| G | `assign_category_id` | String | หมวดหมู่ที่กำหนดให้อัตโนมัติ |
| H | `assign_tags` | String | แท็กที่กำหนดให้อัตโนมัติ |
| I | `is_active` | Boolean | เปิด/ปิดการใช้งาน |
| J | `priority` | Number | ลำดับความสำคัญ |
| K | `created_at` | ISO Timestamp | เวลาสร้าง |
| L | `updated_at` | ISO Timestamp | เวลาแก้ไขล่าสุด |

### 1.13 `Notifications`
| Column | Name | Type | Description |
|---|---|---|---|
| A | `notification_id` | String | รหัสแจ้งเตือน (`ntf_...`) |
| B | `user_id` | String | เจ้าของข้อมูล |
| C | `notif_type` | String | `budget_alert`, `bill_due`, `goal_risk`, `anomaly`, `system` |
| D | `severity` | String | `info`, `warning`, `danger`, `success` |
| E | `title` | String | หัวข้อแจ้งเตือน |
| F | `message` | String | รายละเอียด |
| G | `reference_id` | String | รหัสอ้างอิง (`budget_id`, `bill_id`, ฯลฯ) |
| H | `is_read` | Boolean | อ่านแล้วหรือยัง |
| I | `created_at` | ISO Timestamp | เวลาสร้าง |

### 1.14 `Import_History`
| Column | Name | Type | Description |
|---|---|---|---|
| A | `import_id` | String | รหัสการนำเข้า (`imp_...`) |
| B | `user_id` | String | เจ้าของข้อมูล |
| C | `source_type` | String | `csv_upload`, `bank_statement`, `api_sync` |
| D | `file_name` | String | ชื่อไฟล์ที่นำเข้า |
| E | `account_id` | String | บัญชีที่นำเข้า |
| F | `total_rows` | Number | จำนวนแถวทั้งหมด |
| G | `imported_rows` | Number | จำนวนแถวที่บันทึกสำเร็จ |
| H | `skipped_duplicates` | Number | จำนวนแถวซ้ำที่ข้าม |
| I | `status` | String | `completed`, `partial`, `failed` |
| J | `created_at` | ISO Timestamp | เวลาสร้าง |

### 1.15 `Audit_Logs`
| Column | Name | Type | Description |
|---|---|---|---|
| A | `log_id` | String | รหัส Audit Log (`aud_...`) |
| B | `request_id` | String | Request ID ของคำขอ |
| C | `user_id` | String | ผู้ใช้งานที่ทำรายการ |
| D | `action` | String | ชื่อ Action เช่น `tx.create`, `auth.login`, `account.reconcile` |
| E | `entity_type` | String | โมดูล เช่น `Transactions`, `Accounts` |
| F | `entity_id` | String | รหัสข้อมูลที่ถูกแก้ไข |
| G | `summary` | String | สรุปการเปลี่ยนแปลง |
| H | `metadata_json` | JSON String | ข้อมูลก่อน/หลังแก้ไขแบบย่อ (ไม่มี Secret) |
| I | `created_at` | ISO Timestamp | เวลาที่เกิดเหตุการณ์ |

### 1.16 `Settings`
| Column | Name | Type | Description |
|---|---|---|---|
| A | `setting_id` | String | รหัสตั้งค่า (`set_...`) |
| B | `user_id` | String | รหัสผู้ใช้ |
| C | `setting_key` | String | เช่น `theme`, `base_currency`, `exchange_rates_json`, `email_alerts`, `calendar_sync` |
| D | `setting_value` | String | ค่าการตั้งค่า |
| E | `updated_at` | ISO Timestamp | เวลาแก้ไขล่าสุด |

---

## 2. REST API Actions Specification (Phase 1 – Phase 4 Complete)

ทุกคำขอส่งแบบ `POST` (`Content-Type: text/plain;charset=utf-8` เพื่อรองรับ Google Apps Script Web App โดยไม่ติด CORS Preflight) โดยมีโครงสร้าง Payload มาตรฐานดังนี้:
```json
{
  "request_id": "req_...",
  "action": "module.actionName",
  "session_token": "tok_...",
  "params": {}
}
```

### 2.1 Phase 1 API Actions (Core Modules)
- **System & Backup**: `system.ping`, `system.setup`, `system.settingsGet`, `system.settingsUpdate`, `system.backupExport`, `system.backupRestore`, `system.auditLogs`
- **Authentication**: `auth.register`, `auth.login`, `auth.me`, `auth.logout`, `auth.updatePin`
- **Categories**: `categories.list`, `categories.create`, `categories.update`
- **Accounts**: `accounts.list`, `accounts.create`, `accounts.update`, `accounts.reconcile`
- **Transactions & CSV Import**: `transactions.list`, `transactions.create`, `transactions.update`, `transactions.void`, `transactions.exportCsv`, `transactions.importCsvPreview`, `transactions.importCsvCommit`
- **Dashboard**: `dashboard.summary`

### 2.2 Phase 2 API Actions (Budgets, Savings Goals, Recurring, Reports)
- **Module D — Budgets (`backend/BudgetService.gs`)**:
  - `budgets.list`: คำนวณยอดใช้จริง (`spent_amount`) จากธุรกรรม `expense` หัก `refund` (ไม่นำ `transfer` มาคิดซ้ำ), คำนวณ `effective_limit = amount_limit + rollover_amount`, `remaining_amount`, `used_percentage`, และสถานะแจ้งเตือน (`normal`, `warning`, `exceeded`)
  - `budgets.create`: สร้างงบประมาณรายวัน (`daily`), รายสัปดาห์ (`weekly`), รายเดือน (`monthly`), หรือรายปี (`yearly`) ทั้งแบบงบรวม (`ALL`) และแยกหมวดหมู่
  - `budgets.update`: แก้ไขวงเงิน การยกยอด (`rollover_enabled`, `rollover_amount`) เกณฑ์แจ้งเตือน (`alert_threshold_pct`) หรือยกเลิกงบประมาณ
- **Module E — Savings Goals (`backend/GoalService.gs`)**:
  - `goals.list`: ดึงรายการเป้าหมายการออมทั้งหมด พร้อมคำนวณ `progress_pct`, `remaining_amount`, `days_remaining`, `required_monthly_saving`, `estimated_completion_date`, และสถานะความเสี่ยง (`on_track`, `at_risk`, `completed`)
  - `goals.create`: สร้างเป้าหมายการออมใหม่ พร้อมบันทึกยอดตั้งต้นลงใน `Goal_Contributions` อัตโนมัติ (ถ้ามี)
  - `goals.update`: แก้ไขรายละเอียดเป้าหมายการออม
  - `goals.contribute`: บันทึกรายการเติมเงินออม (`deposit`) หรือถอนเงินออม (`withdraw`) ลงในชีต `Goal_Contributions` และอัปเดต `current_amount` ของเป้าหมายทันที
- **Module F — Recurring Transactions (`backend/RecurringService.gs`)**:
  - `recurring.list`: ดึงกฎรายการประจำ (`recurring_rules`), รายการคาดการณ์ล่วงหน้า 90 วัน (`upcoming_forecasts` ที่มี `record_nature: "FORECAST_ESTIMATE"`), และประวัติธุรกรรมที่สร้างจริงแล้ว (`actual_generated_transactions` ที่มี `record_nature: "ACTUAL_POSTED"`) แยกจากกันอย่างชัดเจน
  - `recurring.create` / `recurring.update`: สร้างหรือแก้ไขกฎรายการประจำ (`daily`, `weekly`, `monthly`, `yearly`)
  - `recurring.processDue`: ประมวลผลรายการประจำที่ครบกำหนด (`next_run_date <= as_of_date`) โดยใช้คีย์ป้องกันซ้ำ `idempotency_key = rec_<recurring_id>_<scheduled_date>` เพื่อป้องกันไม่ให้ Trigger สร้างธุรกรรมซ้ำเด็ดขาด
- **Module H — Reports & Analytics (`backend/ReportService.gs`)**:
  - `reports.overview`: สร้างรายงานวิเคราะห์การเงินครบวงจร แยกเป็น 2 ส่วนหลัก:
    1. `actuals` (`record_nature: "ACTUAL_POSTED_ONLY"`): รายรับจริง, รายจ่ายสุทธิจริง, กระแสเงินสดสุทธิ, มูลค่าสุทธิ (Net Worth), รายงานตามหมวดหมู่ (`by_category`), รายงานตามบัญชี (`by_account`), การเปรียบเทียบรายเดือน (`comparisons.monthly`), รายไตรมาส (`comparisons.quarterly`), รายปี (`comparisons.yearly`), สรุปงบประมาณ (`budget_performance`) และสรุปเป้าหมายการออม (`goals_performance`)
    2. `projections` (`record_nature: "FORECAST_ESTIMATES_SEPARATED"`): ประมาณการกระแสเงินสดล่วงหน้า 90 วันจากรายการประจำ แยกออกจากข้อมูลจริงอย่างชัดเจน

### 2.3 Phase 3 API Actions (Debts, Credit Cards, Bills, Import History & Smart Notifications)
- **Module G — Debts, Amortization & Credit Cards (`backend/DebtService.gs`)**:
  - `debts.list`: ดึงรายการหนี้สินและสินเชื่อจากชีต `Debts`, ประวัติการผ่อนชำระจาก `Debt_Payments`, สรุปยอดค้างชำระบัตรเครดิต วันตัดรอบ (`billing_day`) และวันครบกำหนดชำระ (`due_day`), พร้อมคำนวณอัตราส่วนภาระหนี้ต่อรายได้ (`dti_percentage` และ `dti_status`)
  - `debts.create` / `debts.update`: สร้างหรือแก้ไขสัญญาหนี้สินและสินเชื่อ
  - `debts.pay`: บันทึกการผ่อนชำระหนี้ แยกส่วนตัดเงินต้น (`principal_paid`), ดอกเบี้ยจ่าย (`interest_paid`), และค่าธรรมเนียม (`fee_amount`) ลงในชีต `Debt_Payments` พร้อมตัดยอดเงินจากบัญชีธนาคารอัตโนมัติ
  - `debts.payCreditCard`: ชำระบิลบัตรเครดิตโดยบันทึกเป็นรายการโอนเงินระหว่างบัญชี (`tx_type = "transfer"`) จากบัญชีธนาคารเข้าบัญชีบัตรเครดิต เพื่อป้องกันไม่ให้เกิดการนับรายจ่ายซ้ำซ้อนกับตอนรูดซื้อสินค้า
  - `debts.amortization`: คำนวณตารางผ่อนชำระล่วงหน้าจนครบสัญญา (Amortization Schedule) แสดงค่างวด เงินต้น ดอกเบี้ย และยอดหนี้คงเหลือรายงวด
- **Module G & I — Bills & Import History (`backend/BillService.gs`)**:
  - `bills.list`: ดึงรายการบิลทั้งหมดพร้อมสถานะ (`unpaid`, `paid`, `overdue`) และตรวจจับบิลใกล้ครบกำหนด (`is_due_soon`)
  - `bills.create` / `bills.update`: สร้างหรือแก้ไขบิลแจ้งเตือนวันครบกำหนดชำระ
  - `bills.pay`: ชำระบิล สร้างธุรกรรมรายจ่ายจริง และหากเป็นบิลประจำ (`is_recurring = true`) จะสร้างบิลรอบถัดไปให้อัตโนมัติทันที
  - `imports.list`: ดึงประวัติการนำเข้าไฟล์ Statement CSV จากชีต `Import_History` (หมายเหตุ: ระบบงดเว้นการเชื่อมต่อ Bank API ภายนอกตามนโยบายความปลอดภัยของผู้ใช้ โดยใช้ระบบนำเข้า Statement CSV พร้อม Preview และ `dedup_hash` แทน)
- **Smart Notifications (`backend/NotificationService.gs`)**:
  - `notifications.list`: ดึงรายการแจ้งเตือนทั้งหมดและจำนวนที่ยังไม่อ่าน (`unread_count`)
  - `notifications.generateAlerts`: สแกนข้อมูลจริงจาก `Bills`, `Budgets`, `Debts` และ `Accounts` (บัตรเครดิต) เพื่อสร้างการแจ้งเตือนลงชีต `Notifications` โดยป้องกันการสร้างซ้ำด้วย `reference_id`
  - `notifications.markRead`: ทำเครื่องหมายว่าอ่านแล้ว (รายรายการ หรือ `mark_all = true`)

### 2.4 Phase 4 API Actions (Smart Finance, Automation Rules, Anomaly Detection & Reminders)
- **Module J — Smart Rules & Analytics (`backend/SmartFinanceService.gs`)**:
  - `rules.list`: ดึงกฎจัดหมวดหมู่และติดแท็กอัตโนมัติจากชีต `Rules` เรียงตามลำดับความสำคัญ (`priority`)
  - `rules.create` / `rules.update` / `rules.delete`: สร้าง แก้ไข เปิด/ปิด (`is_active`) หรือลบกฎจัดหมวดหมู่อัตโนมัติ
  - `rules.evaluate`: ทดสอบหรือประมวลผลข้อความรายการ (`merchant`, `description`, `amount`) เทียบกับกฎที่เปิดใช้งานอยู่ในชีต `Rules` เพื่อแนะนำหมวดหมู่ (`suggested_category_id`) และแท็ก (`suggested_tags`) อัตโนมัติ
  - `analytics.insights`: วิเคราะห์ข้อมูลการเงินเชิงลึกจากข้อมูลจริง:
    1. **Spending Anomaly Detection (`anomalies_detected`)**: ตรวจจับรายการรายจ่ายที่สูงผิดปกติเทียบกับค่าเฉลี่ยของหมวดหมู่นั้นๆ
    2. **30 / 60 / 90-Day Cashflow Forecast (`cashflow_forecasts`)**: พยากรณ์กระแสเงินสดและยอดสภาพคล่องคงเหลือปลายงวดล่วงหน้า 30, 60 และ 90 วัน โดยคำนวณจากยอดเงินสด/ธนาคารปัจจุบัน บวกรายรับประจำ หักรายจ่ายประจำ บิลรอชำระ และภาระผ่อนหนี้รายเดือน
    3. **Risk Radar (`risk_radar`)**: สรุปงบประมาณที่เสี่ยงเกินวงเงินและเป้าหมายการออมที่เสี่ยงไม่ทันกำหนด
  - `automation.sendReminder`: ส่งการแจ้งเตือนสรุปสถานะการเงินและบิลครบกำหนดผ่านอีเมล (`MailApp`) และ/หรือปักหมุดลง Google Calendar (`CalendarApp`) พร้อมบันทึก Audit Log

