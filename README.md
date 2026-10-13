# Bank_bana — Personal Finance Manager Pro

ระบบบริหารจัดการการเงินส่วนบุคคลครบวงจร รองรับ **Offline-First Progressive Web App (PWA)**, ซิงก์ข้อมูลกับ **Google Sheets API**, และสามารถเปิดใช้งานบนมือถือ (iOS / Android), แท็บเล็ต และคอมพิวเตอร์ (Windows / Mac) ได้เหมือน Native App

---

## 🌟 ฟีเจอร์หลัก (Features)

1. **Core Modules (Phase 1)**
   - Dashboard แสดงยอดเงินรวม สินทรัพย์ หนี้สิน รายรับ รายจ่าย และอัตราการออม
   - บัญชีการเงิน (Accounts): เงินสด, บัญชีธนาคาร, E-Wallet, บัตรเครดิต, พอร์ตลงทุน พร้อมฟังก์ชันกระทบยอด (Reconcile)
   - ธุรกรรม (Transactions): บันทึกรายรับ รายจ่าย โอนเงิน คืนเงิน ปรับยอด ป้องกันการนับการโอนเงินซ้ำ
   - ป้องกันบันทึกซ้ำด้วย `idempotency_key` และ `dedup_hash`
   - ระบบความปลอดภัย: Multi-user isolation, รหัสผ่าน HMAC-SHA256, รหัส PIN 6 หลัก, ล็อกบัญชีเมื่อใส่รหัสผิดเกินกำหนด

2. **Planning & Analytics (Phase 2)**
   - งบประมาณ (Budgets): รายวัน รายสัปดาห์ รายเดือน รายปี พร้อมระบบยกยอด (Rollover) และแจ้งเตือนเมื่อใกล้เต็ม
   - เป้าหมายการออม (Savings Goals): คำนวณยอดที่ต้องออมต่อเดือน บันทึกประวัติเติม/ถอนเงิน
   - รายการประจำ (Recurring Transactions): แยกรายการคาดการณ์ 90 วันออกจากรายการจริง ป้องกัน Trigger ซ้ำ
   - รายงานและการวิเคราะห์ (Reports & Analytics): เปรียบเทียบรายเดือน ไตรมาส ปี แยก Actuals vs Forecast ชัดเจน, Export CSV และ Print/PDF

3. **Liabilities & Alerts (Phase 3)**
   - หนี้สินและสินเชื่อ (Debts & Loans): คำนวณเงินต้น ดอกเบี้ย และตารางผ่อนชำระ (Amortization Schedule)
   - ภาระหนี้ต่อรายได้ (DTI - Debt-to-Income Ratio)
   - ติดตามรอบบิลบัตรเครดิต และชำระยอดบัตรแบบ Internal Transfer (ไม่คิดรายจ่ายซ้ำกับตอนรูดซื้อสินค้า)
   - บิลแจ้งเตือนวันครบกำหนดชำระ (Bills Schedule) พร้อมสร้างบิลรอบถัดไปอัตโนมัติเมื่อกดชำระ
   - นำเข้า Statement จาก CSV พร้อม Preview และประวัติในชีต `Import_History` (Zero Bank Credential Policy — ไม่เชื่อมต่อ Bank API ภายนอกเพื่อความปลอดภัยสูงสุด)
   - ศูนย์การแจ้งเตือนอัจฉริยะ (Smart Notifications)

4. **Smart Finance & Automation (Phase 4)**
   - กฎจัดหมวดหมู่และติดแท็กอัตโนมัติ (Smart Rules ในชีต `Rules`)
   - ปุ่มแนะนำหมวดหมู่อัตโนมัติ (Smart Suggest) ตอนจดธุรกรรม
   - พยากรณ์กระแสเงินสดและสภาพคล่องล่วงหน้า 30 / 60 / 90 วัน (Cashflow Forecast)
   - ตรวจจับค่าใช้จ่ายที่สูงผิดปกติเทียบกับค่าเฉลี่ยย้อนหลัง (Spending Anomaly Detection)
   - เรดาร์ความเสี่ยงงบประมาณและเป้าหมายการออม (Risk Radar)
   - ส่งอีเมลแจ้งเตือนผ่าน Gmail (`MailApp`) และปักหมุดนัดหมายบน Google Calendar (`CalendarApp`)

5. **Offline-First PWA Support (Web App)**
   - รองรับการเปิดใช้งานบนมือถือ (iOS / Android) และคอมพิวเตอร์ (Chrome / Edge)
   - ติดตั้งลงหน้าจอโฮม/เดสก์ท็อปเป็นหน้าต่างแอปเต็มจอได้ (Standalone Display)
   - ทำงานได้แม้อยู่ในโหมดออฟไลน์ / ไม่มีอินเทอร์เน็ต (Service Worker Cache)
   - มี Outbox Queue จดรายการไว้ตอนออฟไลน์ และซิงก์ขึ้น Google Sheets อัตโนมัติเมื่อต่อเน็ต

---

## 🚀 วิธีเปิดใช้งาน GitHub Pages เพื่อเป็น Web App ฟรี

1. นำโค้ดขึ้น GitHub Repository: `https://github.com/Frankbanna/Finance.git`
2. ไปที่หน้า GitHub Repository ของคุณ -> คลิกแถบ **Settings**
3. ที่เมนูด้านซ้าย เลือก **Pages** (ใต้หมวด Code and automation)
4. ในส่วน **Build and deployment > Source**:
   - เลือก **Deploy from a branch**
   - Branch: เลือก **`main`** และโฟลเดอร์ **`/frontend`** (หรือ `/root` หากตั้งค่าโฟลเดอร์หลัก)
   - คลิก **Save**
5. รอ 1–2 นาที GitHub Pages จะสร้าง URL เว็บไซต์ให้ เช่น:
   `https://frankbanna.github.io/Finance/`
6. เปิดลิงก์ดังกล่าวบนมือถือหรือคอมพิวเตอร์ และกด **"เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)"** หรือ **"ติดตั้งแอป (Install App)"** ได้ทันที!

---

## 🛠️ โครงสร้างโปรเจกต์ (Project Structure)

```
Finance/
├── backend/                  # Google Apps Script Backend (API & Business Logic)
│   ├── Code.gs               # API Router & HTTP Request Handler
│   ├── Config.gs             # Configuration & Schemas
│   ├── AuthService.gs        # Authentication (HMAC-SHA256, PIN, Lockout)
│   ├── AccountService.gs     # Accounts & Reconciliation
│   ├── TransactionService.gs # Transactions, Transfers, Dedup, Revision
│   ├── CategoryService.gs    # Categories Management
│   ├── BudgetService.gs      # Budgets & Rollover
│   ├── GoalService.gs        # Savings Goals & Contributions
│   ├── RecurringService.gs   # Recurring Rules & Idempotent Trigger
│   ├── DebtService.gs        # Debts, Amortization, DTI & CC Settlement
│   ├── BillService.gs        # Bills Schedule & Import History
│   ├── NotificationService.gs# Smart Alerts & Deduplication
│   ├── SmartFinanceService.gs# Rules Engine, Anomaly & Cashflow Forecast
│   ├── ReportService.gs      # Actuals vs Projections Reports
│   ├── SystemService.gs      # Backup, Restore & Audit Logs
│   └── Setup.gs              # Automatic 16-Sheet Setup Function
├── frontend/                 # Responsive Mobile-First Client (PWA)
│   ├── index.html            # Main Single Page Application (SPA)
│   ├── manifest.json         # PWA Web App Manifest
│   ├── sw.js                 # Service Worker (Offline Cache)
│   ├── icons/                # PWA App Icons (180x180, 192x192, 512x512)
│   ├── css/styles.css        # Responsive Theme Styles (Light/Dark Mode)
│   └── js/                   # Frontend Module Controllers
│       ├── offline.js        # Offline-First & Outbox Auto-Sync Engine
│       ├── api.js            # REST Client with Offline Fallback
│       ├── auth.js           # Login & PIN Controller
│       ├── dashboard.js      # Dashboard Controller & Chart.js
│       ├── accounts.js       # Accounts Management
│       ├── transactions.js   # Transactions CRUD & CSV Import
│       ├── budgets.js        # Budgets Controller
│       ├── goals.js          # Savings Goals Controller
│       ├── recurring.js      # Recurring Transactions
│       ├── debts.js          # Debts, Amortization & CC Settlement
│       ├── bills.js          # Bills & Notifications
│       ├── automation.js     # Smart Rules & Insights
│       ├── reports.js        # Reports & Analytics
│       └── app.js            # Application Shell & Router
├── docs/                     # Comprehensive Documentation
│   ├── DATABASE_SCHEMA_AND_API.md
│   ├── DEPLOYMENT_AND_SETUP_GUIDE.md
│   └── TESTING_AND_BACKUP_GUIDE.md
├── tools/                    # Automated Acceptance Test Suites
└── README.md
```

