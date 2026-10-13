/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: Setup.gs
 * Description: Automated database schema creation, header verification, and isolated demo data seeding.
 */

const DEFAULT_SYSTEM_CATEGORIES = [
  ['cat_inc_salary', 'SYSTEM', '', 'เงินเดือนประจำ (Salary)', 'income', '#10B981', 'briefcase', true, true],
  ['cat_inc_bonus', 'SYSTEM', 'cat_inc_salary', 'โบนัสและคอมมิชชัน (Bonus)', 'income', '#059669', 'award', true, true],
  ['cat_inc_freelance', 'SYSTEM', '', 'รายได้เสริม / ฟรีแลนซ์', 'income', '#34D399', 'laptop', true, true],
  ['cat_inc_invest', 'SYSTEM', '', 'ผลตอบแทนการลงทุน / ปันผล', 'income', '#0EA5E9', 'trending-up', true, true],
  ['cat_inc_other', 'SYSTEM', '', 'รายรับอื่นๆ', 'income', '#6366F1', 'plus-circle', true, true],
  ['cat_exp_food', 'SYSTEM', '', 'อาหารและเครื่องดื่ม', 'expense', '#F59E0B', 'utensils', true, true],
  ['cat_exp_food_dining', 'SYSTEM', 'cat_exp_food', 'ทานอาหารนอกบ้าน', 'expense', '#D97706', 'coffee', true, true],
  ['cat_exp_food_grocery', 'SYSTEM', 'cat_exp_food', 'ของสด / ซูเปอร์มาร์เก็ต', 'expense', '#FBBF24', 'shopping-basket', true, true],
  ['cat_exp_transport', 'SYSTEM', '', 'การเดินทางและยานพาหนะ', 'expense', '#3B82F6', 'car', true, true],
  ['cat_exp_transport_fuel', 'SYSTEM', 'cat_exp_transport', 'ค่าน้ำมัน / ชาร์จไฟ', 'expense', '#2563EB', 'fuel', true, true],
  ['cat_exp_transport_transit', 'SYSTEM', 'cat_exp_transport', 'รถไฟฟ้า / แท็กซี่ / ทางด่วน', 'expense', '#60A5FA', 'train', true, true],
  ['cat_exp_housing', 'SYSTEM', '', 'ที่อยู่อาศัยและสาธารณูปโภค', 'expense', '#8B5CF6', 'home', true, true],
  ['cat_exp_housing_rent', 'SYSTEM', 'cat_exp_housing', 'ค่าเช่า / ผ่อนบ้าน', 'expense', '#7C3AED', 'key', true, true],
  ['cat_exp_housing_util', 'SYSTEM', 'cat_exp_housing', 'ค่าน้ำ / ค่าไฟ / อินเทอร์เน็ต', 'expense', '#A78BFA', 'zap', true, true],
  ['cat_exp_shopping', 'SYSTEM', '', 'ช้อปปิ้งและของใช้ส่วนตัว', 'expense', '#EC4899', 'shopping-bag', true, true],
  ['cat_exp_health', 'SYSTEM', '', 'สุขภาพและการแพทย์', 'expense', '#EF4444', 'heart-pulse', true, true],
  ['cat_exp_entertainment', 'SYSTEM', '', 'บันเทิงและสมาชิกรายเดือน', 'expense', '#14B8A6', 'film', true, true],
  ['cat_exp_education', 'SYSTEM', '', 'การศึกษาและพัฒนาตนเอง', 'expense', '#06B6D4', 'book-open', true, true],
  ['cat_exp_debt_interest', 'SYSTEM', '', 'ดอกเบี้ยและค่าธรรมเนียมการเงิน', 'expense', '#DC2626', 'percent', true, true],
  ['cat_trf_internal', 'SYSTEM', '', 'โอนเงินระหว่างบัญชี', 'transfer', '#64748B', 'arrow-left-right', true, true],
  ['cat_adj_reconcile', 'SYSTEM', '', 'ปรับปรุงยอดเงิน (กระทบยอด)', 'adjustment', '#94A3B8', 'sliders', true, true]
];

/**
 * Automatically creates all 16 required sheets, configures headers, and seeds system categories.
 * Can be triggered directly from Apps Script editor or via API action `system.setup`.
 */
function setupDatabase() {
  return withWriteLock(function() {
    const ss = getSpreadsheet();
    const createdSheets = [];
    const verifiedSheets = [];
    const sheetKeys = Object.keys(SHEET_NAMES);

    for (let i = 0; i < sheetKeys.length; i++) {
      const sheetName = SHEET_NAMES[sheetKeys[i]];
      const expectedHeaders = SHEET_HEADERS[sheetName];
      let sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        createdSheets.push(sheetName);
      } else {
        verifiedSheets.push(sheetName);
      }

      // Ensure header row matches schema
      const lastCol = Math.max(sheet.getLastColumn(), expectedHeaders.length);
      const currentHeaders = sheet.getLastRow() >= 1
        ? sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0]
        : [];

      let needsHeaderWrite = false;
      for (let c = 0; c < expectedHeaders.length; c++) {
        if (String(currentHeaders[c] || '').trim() !== expectedHeaders[c]) {
          needsHeaderWrite = true;
          break;
        }
      }

      if (needsHeaderWrite) {
        const headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
        headerRange.setValues([expectedHeaders]);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#0F172A');
        headerRange.setFontColor('#F8FAFC');
        sheet.setFrozenRows(1);
      }
    }

    // Remove default 'Sheet1' if it still exists and is not one of our 16 sheets
    const defaultSheet = ss.getSheetByName('Sheet1');
    if (defaultSheet && ss.getSheets().length > 1) {
      ss.deleteSheet(defaultSheet);
    }

    // Seed default SYSTEM categories if missing
    const existingCats = readSheetObjects(SHEET_NAMES.CATEGORIES);
    const existingCatIds = {};
    existingCats.forEach(function(c) {
      existingCatIds[c.category_id] = true;
    });

    const now = nowIso();
    const catsToAppend = [];
    DEFAULT_SYSTEM_CATEGORIES.forEach(function(row) {
      if (!existingCatIds[row[0]]) {
        catsToAppend.push({
          category_id: row[0],
          user_id: row[1],
          parent_id: row[2],
          category_name: row[3],
          category_type: row[4],
          color: row[5],
          icon: row[6],
          is_system: row[7],
          is_active: row[8],
          created_at: now,
          updated_at: now
        });
      }
    });

    if (catsToAppend.length > 0) {
      batchAppendObjects(SHEET_NAMES.CATEGORIES, catsToAppend);
    }

    return {
      spreadsheet_id: ss.getId(),
      spreadsheet_name: ss.getName(),
      created_sheets: createdSheets,
      verified_sheets: verifiedSheets,
      seeded_categories_count: catsToAppend.length,
      timestamp: now
    };
  });
}

