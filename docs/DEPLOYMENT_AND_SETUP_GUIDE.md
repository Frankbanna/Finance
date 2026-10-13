# คู่มือการติดตั้ง ตั้งค่า Google Sheets และ Deploy Google Apps Script (Web App)

เอกสารนี้อธิบายขั้นตอนการตั้งค่าฐานข้อมูล Google Sheets, การตั้งค่า Script Properties และการ Deploy Google Apps Script เป็น Backend REST API สำหรับ **Personal Finance Manager Pro**

---

## 1. ข้อมูล Google Spreadsheet จริงของโปรเจกต์

ระบบได้สร้าง Google Spreadsheet จริงพร้อมทั้ง **16 ชีตมาตรฐาน** และหมวดหมู่เริ่มต้น (`SYSTEM` Categories) ให้เรียบร้อยแล้ว:
- **ชื่อไฟล์**: `Personal Finance Manager Pro - Database`
- **Spreadsheet ID**: `15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A`
- **ลิงก์เปิดดูฐานข้อมูลจริง**: `https://docs.google.com/spreadsheets/d/15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A/edit`

### รายชื่อชีตทั้ง 16 ชีตในฐานข้อมูล:
1. `Users` — ข้อมูลผู้ใช้, Password Hash (HMAC-SHA256), PIN Hash, Salt, Session Token
2. `Accounts` — บัญชีเงินสด, ธนาคาร, E-Wallet, บัตรเครดิต, พอร์ตลงทุน
3. `Transactions` — รายรับ, รายจ่าย, โอนเงิน, คืนเงิน, ปรับยอด, ประวัติแก้ไข (Revision JSON)
4. `Categories` — หมวดหมู่หลักและหมวดหมู่ย่อย (ทั้งหมวดหมู่ระบบและผู้ใช้กำหนดเอง)
5. `Budgets` — งบประมาณรายวัน/สัปดาห์/เดือน/ปี
6. `Goals` — เป้าหมายการออม
7. `Goal_Contributions` — ประวัติการเติม/ถอนเงินเป้าหมายการออม
8. `Recurring` — รายการธุรกรรมประจำอัตโนมัติ
9. `Debts` — รายการหนี้สินและสินเชื่อ
10. `Debt_Payments` — ประวัติการผ่อนชำระหนี้ (เงินต้น/ดอกเบี้ย)
11. `Bills` — รายการบิลและวันครบกำหนดชำระ
12. `Rules` — กฎจัดหมวดหมู่อัตโนมัติ
13. `Notifications` — การแจ้งเตือนในระบบ
14. `Import_History` — ประวัติการนำเข้าไฟล์ CSV Statement
15. `Audit_Logs` — บันทึกการตรวจสอบความปลอดภัยทุกคำขอ
16. `Settings` — การตั้งค่ารายผู้ใช้

---

## 2. วิธีรันใช้งานจริงทันทีบนเครื่อง (Live Google Sheets Bridge Mode)

คุณสามารถเปิดใช้งานเว็บไซต์และบันทึกข้อมูลลงใน Google Sheets จริง (`15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A`) ได้ทันทีโดยรันคำสั่ง:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\live-sheets-server.ps1 -Port 3000
```

จากนั้นเปิดเบราว์เซอร์ไปที่:
- **URL หน้าเว็บ**: `http://localhost:3000`
- **บัญชีทดสอบ (แยกจากข้อมูลจริง)**:
  - อีเมล: `demo@pfm.local`
  - รหัสผ่าน: `Demo@1234`
  - หรือรหัส PIN 6 หลัก: `123456`
  - (คุณสามารถกดปุ่ม **"สมัครใช้งานใหม่"** เพื่อสร้างบัญชีจริงของคุณเองได้ทันที ข้อมูลจะถูกแยกตาม `user_id` อย่างสมบูรณ์)

---

## 3. วิธี Deploy โค้ดขึ้น Google Apps Script Web App (สำหรับโฮสต์แยกบน GitHub Pages / Vercel / Netlify)

หากต้องการนำ Frontend ไปโฮสต์บน Static Hosting ภายนอกโดยเชื่อมต่อกับ Google Apps Script Web App URL โดยตรง:

### ขั้นตอนที่ 3.1 สร้างโปรเจกต์ Google Apps Script
1. เปิด Google Spreadsheet (`15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A`)
2. ไปที่เมนู **ส่วนขยาย (Extensions) > Apps Script**
3. สร้างไฟล์ `.gs` ใน Apps Script Editor ให้ตรงกับไฟล์ในโฟลเดอร์ `backend/` ทั้ง 9 ไฟล์:
   - `Config.gs`
   - `Utils.gs`
   - `Setup.gs`
   - `AuthService.gs`
   - `CategoryService.gs`
   - `AccountService.gs`
   - `TransactionService.gs`
   - `DashboardService.gs`
   - `SystemService.gs`
   - `Code.gs`

### ขั้นตอนที่ 3.2 ตั้งค่า Script Properties
1. ในหน้า Google Apps Script คลิกไอคอน **การตั้งค่าโปรเจกต์ (Project Settings / รูปเฟือง)** ด้านซ้าย
2. เลื่อนลงมาที่หัวข้อ **คุณสมบัติสคริปต์ (Script Properties)** แล้วกด **เพิ่มคุณสมบัติสคริปต์ (Add script property)**:
   - `SPREADSHEET_ID` = `15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A`
   - `AUTH_PEPPER_SECRET` = ตั้งค่าข้อความลับสุ่มความยาวอย่างน้อย 32 ตัวอักษร (เช่น `pfm_prod_secret_9f8e7d6c5b4a3210`)
3. กด **บันทึกคุณสมบัติสคริปต์ (Save script properties)**

### ขั้นตอนที่ 3.3 รันฟังก์ชัน `setupDatabase()` ครั้งแรก
1. กลับไปที่หน้า **เอดิเตอร์ (Editor)** เลือกไฟล์ `Setup.gs`
2. เลือกฟังก์ชัน `setupDatabase` จากแถบด้านบน แล้วกด **เรียกใช้ (Run)**
3. ยืนยันสิทธิ์การเข้าถึง Google Sheets (Review Permissions > Allow)

### ขั้นตอนที่ 3.4 Deploy เป็น Web App
1. คลิกปุ่ม **ทำให้ใช้งานได้ (Deploy) > การทำให้ใช้งานได้รายการใหม่ (New deployment)** มุมขวาบน
2. เลือกประเภทเป็น **เว็บแอป (Web app)**
3. ตั้งค่าดังนี้:
   - **คำอธิบาย (Description)**: `PFM Pro API v1.0`
   - **ดำเนินการในฐานะ (Execute as)**: `ฉัน (Me)`
   - **ผู้ที่มีสิทธิ์เข้าถึง (Who has access)**: `ทุกคน (Anyone)` *(เพื่อให้ Standalone Frontend ส่ง POST request มาได้โดยระบบจะตรวจสอบ `session_token` ภายใน `doPost` ทุกครั้ง)*
4. กด **ทำให้ใช้งานได้ (Deploy)** แล้วคัดลอก **Web App URL** (`https://script.google.com/macros/s/.../exec`)
5. นำ URL ที่ได้ไปวางในช่อง **"ตั้งค่าการเชื่อมต่อ Google Apps Script API URL"** บนหน้าเข้าสู่ระบบ หรือในหน้า **ตั้งค่า & สำรองข้อมูล** ของเว็บไซต์

