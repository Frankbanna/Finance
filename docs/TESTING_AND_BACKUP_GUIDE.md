# คู่มือการทดสอบ API, Acceptance Test, การสำรอง/กู้คืนข้อมูล และการแก้ไขปัญหา (Troubleshooting)

เอกสารนี้อธิบายวิธีการทดสอบระบบ **Personal Finance Manager Pro (Phase 1)** กับฐานข้อมูล Google Sheets จริง, ขั้นตอนการสำรองและกู้คืนข้อมูล (Backup & Restore) และแนวทางแก้ไขปัญหาที่อาจพบในการใช้งานจริง

---

## 1. การรันชุดทดสอบอัตโนมัติ (Automated Live Acceptance Tests)

โปรเจกต์มีสคริปต์ทดสอบแบบ End-to-End ที่เชื่อมต่อและบันทึกข้อมูลจริงลงใน Google Spreadsheet (`15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A`)

### คำสั่งรันทดสอบ:
```powershell
powershell -ExecutionPolicy Bypass -File .\tools\acceptance-test-phase1.ps1
```

### รายการทดสอบทั้ง 11 หัวข้อในสคริปต์:
1. **`system.ping`**: ตรวจสอบสถานะเซิร์ฟเวอร์และรหัสฐานข้อมูล Google Sheets
2. **`system.setup`**: ยืนยันว่าทั้ง 16 ชีตและหัวคอลัมน์พร้อมใช้งาน
3. **`auth.register` & `auth.login` (Password)**: ทดสอบการสร้างผู้ใช้และเข้าสู่ระบบด้วยรหัสผ่านที่เข้ารหัสแบบ HMAC-SHA256 พร้อม Salt
4. **`auth.login` (6-Digit PIN)**: ทดสอบการเข้าสู่ระบบด้วยรหัส PIN 6 หลัก
5. **`accounts.create` & `accounts.list`**: ทดสอบการสร้างบัญชีธนาคาร, เงินสด และบัตรเครดิต พร้อมยอดตั้งต้น
6. **Idempotency & Duplicate Prevention**: ทดสอบส่งคำขอ `transactions.create` ซ้ำด้วย `idempotency_key` เดิม ระบบต้องคืนค่า `idempotent_replay: true` และไม่บันทึกแถวซ้ำใน Google Sheets
7. **Transactions CRUD (`income`, `expense`, `transfer`, `refund`)**: ทดสอบบันทึกรายรับ, รายจ่าย, โอนเงินระหว่างบัญชี และคืนเงิน
8. **CSV Import Preview & Commit (`transactions.importCsvPreview` / `transactions.importCsvCommit`)**: ทดสอบการตรวจสอบไฟล์ CSV จับคู่หมวดหมู่อัตโนมัติ และตรวจจับรายการซ้ำ
9. **Dashboard Math & Transfer Exclusion (`dashboard.summary`)**: พิสูจน์ว่า:
   - รายรับ (`period_income`) = ผลรวมเฉพาะรายการ `income` (ไม่รวมยอดโอนเงิน `transfer`)
   - รายจ่ายสุทธิ (`period_expense`) = รายจ่ายรวม (`expense`) หักด้วยเงินคืน (`refund`) (ไม่รวมยอดโอนเงิน `transfer`)
   - เงินสุทธิ (`period_net_cashflow`) = `period_income - period_expense`
10. **Strict Multi-User Isolation**: สร้างผู้ใช้คนที่สอง (`alice.isolation@pfm.local`) แล้วทดสอบดึงรายการบัญชีและธุรกรรม ต้องไม่เห็นข้อมูลของ `demo@pfm.local` แม้แต่รายการเดียว
11. **Backup Export & Audit Logs (`system.backupExport` / `system.auditLogs`)**: ทดสอบส่งออก JSON Backup ของผู้ใช้และตรวจสอบการบันทึก Audit Logs ในชีต `Audit_Logs`

---

## 2. คู่มือการสำรองและกู้คืนข้อมูล (Backup & Restore Policy)

### 2.1 การสำรองข้อมูลผ่านหน้าเว็บ (User-Level JSON Backup)
1. เข้าสู่ระบบแล้วไปที่เมนู **ตั้งค่า & สำรองข้อมูล (Settings & Security)**
2. คลิกปุ่ม **ดาวน์โหลดไฟล์ Backup (.json)**
3. ระบบจะดึงข้อมูลเฉพาะ `user_id` ของคุณจากทุกชีตใน Google Sheets มารวมเป็นไฟล์ `.json` พร้อมระบุเวลา `exported_at`

### 2.2 การกู้คืนข้อมูล (Restore from JSON Backup)
1. ไปที่เมนู **ตั้งค่า & สำรองข้อมูล**
2. คลิกปุ่ม **กู้คืนข้อมูลจากไฟล์ Backup** แล้วเลือกไฟล์ `.json` ที่เคยสำรองไว้
3. ระบบจะตรวจสอบ Primary ID ของแต่ละตาราง (`account_id`, `transaction_id`, `category_id`, ฯลฯ) และนำเข้าเฉพาะรายการที่ยังไม่มีในระบบเพื่อป้องกันข้อมูลซ้ำซ้อน จากนั้นคำนวณยอดเงินคงเหลือทุกบัญชีใหม่อัตโนมัติ

### 2.3 การสำรองข้อมูลระดับ Google Spreadsheet ทั้งไฟล์
- ใน Google Sheets สามารถดูประวัติเวอร์ชันย้อนหลังได้ที่เมนู **ไฟล์ (File) > ประวัติเวอร์ชัน (Version history) > ดูประวัติเวอร์ชัน**
- แนะนำให้ทำสำเนาไฟล์รายเดือนผ่านเมนู **ไฟล์ > ทำสำเนา (Make a copy)** สำหรับเก็บเป็น Archive

---

## 3. แนวทางแก้ไขปัญหาที่พบบ่อย (Troubleshooting)

| อาการที่พบ | สาเหตุ | วิธีแก้ไข |
|---|---|---|
| เรียก Google Apps Script Web App แล้วติด CORS Error | ส่ง Header `Content-Type: application/json` ทำให้เบราว์เซอร์ยิง `OPTIONS` Preflight ซึ่ง GAS ไม่รองรับ | ใช้ `PFM_API.call()` ใน `frontend/js/api.js` ซึ่งตั้งค่า `Content-Type: text/plain;charset=utf-8` และ `redirect: 'follow'` ไว้ให้ถูกต้องแล้ว |
| ยอดเงินในบัญชีไม่ตรงกับเงินจริงในธนาคาร | มีรายการค่าธรรมเนียมหรือรายการย่อยที่ลืมจดบันทึก | ไปที่หน้า **บัญชีการเงิน (Accounts)** กดปุ่ม **กระทบยอด (Reconcile)** แล้วกรอกยอดเงินจริง ระบบจะสร้างรายการปรับยอด (`adjustment`) ให้ตรงกันอัตโนมัติ |
| ขึ้นข้อความ `ACCOUNT_LOCKED` ตอนเข้าสู่ระบบ | กรอกรหัสผ่านหรือ PIN ผิดติดต่อกันครบ 5 ครั้ง | รอเวลาปลดล็อกอัตโนมัติ 15 นาที หรือผู้ดูแลระบบสามารถล้างค่าในคอลัมน์ `failed_attempts` และ `locked_until` ในชีต `Users` |
| นำเข้าไฟล์ CSV แล้วไม่พบข้อมูล | หัวคอลัมน์ในไฟล์ CSV ไม่ตรงกับรูปแบบที่รองรับ | ตรวจสอบว่าแถวแรกของไฟล์ CSV มีคอลัมน์ `tx_date,tx_time,tx_type,amount,merchant,description,tags` (ดูตัวอย่างได้จากไฟล์ `samples/sample_statement_import.csv`) |

---

## 4. การรันชุดทดสอบอัตโนมัติ Phase 2 (Budgets, Goals, Recurring & Reports)

### คำสั่งรันทดสอบ Phase 2:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\fang0\OneDrive\Desktop\Finance\tools\acceptance-test-phase2.ps1"
```

### รายการทดสอบ End-to-End ใน `acceptance-test-phase2.ps1`:
1. **Authentication & Account Verification**: เข้าสู่ระบบด้วยบัญชี `demo@pfm.local` และตรวจสอบบัญชีจริงใน Google Sheets
2. **Module D — Budgets (`budgets.create`, `budgets.list`, `budgets.update`)**:
   - ทดสอบการคำนวณงบรวมพร้อมยอดยกมา (`Rollover`: `15,000 + 1,000 = 16,000 THB`)
   - ทดสอบการคำนวณยอดใช้จริงจากชีต `Transactions` (`spent_amount = 9,180 THB`, `57.38%`) และการแจ้งเตือนเมื่อถึงเกณฑ์ (`alert_threshold_pct = 50%` -> `warning`)
   - ทดสอบงบแยกหมวดหมู่ค่าที่อยู่อาศัย (`cat_exp_housing`) หักรายการคืนเงิน (`8,500 - 500 = 8,000 THB`)
3. **Module E — Savings Goals & Contributions (`goals.create`, `goals.contribute`, `goals.list`)**:
   - สร้างเป้าหมายการออมพร้อมเงินตั้งต้น `20,000 / 120,000 THB` และตรวจสอบการคำนวณยอดที่ต้องออมต่อเดือน (`required_monthly_saving`)
   - ทดสอบฝากเงินเพิ่ม (`deposit +10,000 THB`) และถอนเงิน (`withdraw -2,000 THB`) พร้อมตรวจสอบประวัติในชีต `Goal_Contributions`
4. **Module F — Recurring Transactions & Trigger Idempotency (`recurring.create`, `recurring.processDue`, `recurring.list`)**:
   - สร้างรายการประจำที่ครบกำหนด (`next_run_date = 2026-10-10`) และสั่งรัน `recurring.processDue` ครั้งที่ 1 เพื่อสร้างธุรกรรมจริงลงชีต `Transactions`
   - ทดสอบ **Trigger Idempotency Guard**: ย้อน `next_run_date` กลับเป็น `2026-10-10` แล้วรัน `recurring.processDue` ซ้ำ ระบบต้องข้ามรายการซ้ำ (`skipped_duplicates_count = 1`, `generated_count = 0`) ด้วยคีย์ `rec_<recurring_id>_2026-10-10`
   - ตรวจสอบการแยกรายการคาดการณ์ล่วงหน้า (`FORECAST_ESTIMATE`) ออกจากรายการที่เกิดขึ้นจริง (`ACTUAL_POSTED`)
5. **Module H — Reports & Analytics (`reports.overview`)**:
   - ยืนยันว่า `actuals` (`ACTUAL_POSTED_ONLY`) แยกออกจาก `projections` (`FORECAST_ESTIMATES_SEPARATED`)
   - ตรวจสอบความถูกต้องของรายจ่ายสุทธิจริงหลังรวมรายการประจำ (`9,180 + 699 = 9,879 THB`) และตารางเปรียบเทียบรายเดือน/ไตรมาส/ปี
6. **Dashboard Integration (`dashboard.summary`)**:
   - ยืนยันว่าหน้า Dashboard ดึงข้อมูลงบประมาณจากชีต `Budgets` จริงไปแสดงในส่วน "งบประมาณใกล้เต็ม" (`budgets_near_limit`)

---

## 5. การรันชุดทดสอบอัตโนมัติ Phase 3 (Debts, Credit Cards, Bills, Import History & Notifications)

### คำสั่งรันทดสอบ Phase 3:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\fang0\OneDrive\Desktop\Finance\tools\acceptance-test-phase3.ps1"
```

### รายการทดสอบ End-to-End ใน `acceptance-test-phase3.ps1`:
1. **Non-Duplicate Credit Card Settlement (`debts.payCreditCard`)**:
   - ทดสอบรูดซื้อสินค้าผ่านบัตรเครดิต (`expense`) แล้วชำระบิลบัตรเครดิตจากบัญชีธนาคาร (`debts.payCreditCard` ซึ่งบันทึกเป็น `transfer`)
   - พิสูจน์ว่ายอดรายจ่ายรวมใน `dashboard.summary` **ไม่ถูกนับซ้ำ** (`0 double-counting`)
2. **Loan Management, Principal/Interest Split & Amortization (`debts.create`, `debts.pay`, `debts.amortization`)**:
   - สร้างสินเชื่อในชีต `Debts` (`300,000 THB`, ดอกเบี้ย `6.0%` ต่อปี)
   - ผ่อนชำระ `7,500 THB` ระบบแยกบันทึกดอกเบี้ย `1,500 THB` และตัดเงินต้น `6,000 THB` ลงในชีต `Debt_Payments` เหลือเงินต้น `294,000 THB`
   - คำนวณตารางผ่อนชำระล่วงหน้า (Amortization Schedule) และอัตราส่วนภาระหนี้ต่อรายได้ (`DTI`)
3. **Recurring Bills & Auto-Next-Cycle Generation (`bills.create`, `bills.pay`)**:
   - สร้างบิลค่าไฟฟ้ารายเดือนและกดชำระบิล ระบบสร้างธุรกรรมรายจ่ายจริงพร้อมสร้างบิลรอบเดือนถัดไปให้อัตโนมัติทันที
4. **Statement CSV Import History (`imports.list`)**:
   - ตรวจสอบประวัติการนำเข้าไฟล์ CSV ในชีต `Import_History` (ไม่ใช้การเชื่อมต่อ Bank API ภายนอกตามนโยบายความปลอดภัยของผู้ใช้)
5. **Smart Alert Deduplication & Read Tracking (`notifications.generateAlerts`, `notifications.markRead`)**:
   - สแกนสร้างการแจ้งเตือนจากข้อมูลจริง ทดสอบรันซ้ำเพื่อยืนยันว่าไม่สร้างแจ้งเตือนซ้ำ (`0 duplicates`) และทดสอบทำเครื่องหมายว่าอ่านแล้ว

---

## 6. การรันชุดทดสอบอัตโนมัติ Phase 4 (Smart Rules, Anomaly Detection, Cashflow Forecast & Reminders)

### คำสั่งรันทดสอบ Phase 4:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\fang0\OneDrive\Desktop\Finance\tools\acceptance-test-phase4.ps1"
```

### รายการทดสอบ End-to-End ใน `acceptance-test-phase4.ps1`:
1. **Smart Categorization Rules CRUD (`rules.create`, `rules.list`)**:
   - สร้างกฎจัดหมวดหมู่อัตโนมัติในชีต `Rules` (เช่น จับคู่คำว่า `starbucks` เข้าหมวดหมู่ `อาหารและเครื่องดื่ม` พร้อมแท็ก `coffee,cafe,smart-rule`)
2. **Live Rule Evaluator & Active Toggle (`rules.evaluate`, `rules.update`)**:
   - ทดสอบประมวลผลข้อความรายการและยืนยันว่าเมื่อสั่งปิดกฎ (`is_active = false`) ระบบจะหยุดใช้กฎนั้นทันที และเมื่อเปิดกลับ (`is_active = true`) ระบบจะกลับมาจับคู่หมวดหมู่ตามปกติ
3. **Spending Anomaly Detection & 30/60/90-Day Cashflow Forecast (`analytics.insights`)**:
   - คำนวณพยากรณ์กระแสเงินสดล่วงหน้า 30, 60 และ 90 วันจากยอดสภาพคล่องจริง รายการประจำ บิลรอชำระ และภาระผ่อนหนี้
   - ตรวจจับรายการรายจ่ายที่สูงผิดปกติเทียบค่าเฉลี่ยหมวดหมู่ และตรวจสอบเรดาร์ความเสี่ยงงบประมาณ/เป้าหมายการออม (`risk_radar`)
4. **Email & Google Calendar Reminder Dispatch (`automation.sendReminder`)**:
   - ทดสอบสั่งส่งแจ้งเตือนและบันทึกประวัติลงใน `Audit_Logs`

