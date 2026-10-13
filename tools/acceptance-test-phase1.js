/**
 * PERSONAL FINANCE MANAGER PRO
 * Phase 1 Live Acceptance Test Suite (`tools/acceptance-test-phase1.js`)
 *
 * Runs end-to-end verification against the live server & real Google Sheets database
 * (`15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A`).
 */

const assert = require('assert');

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

async function callApi(action, sessionToken, params) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: action,
      session_token: sessionToken || '',
      params: params || {}
    })
  });
  return await res.json();
}

async function runTests() {
  console.log('=== STARTING PHASE 1 ACCEPTANCE TESTS AGAINST REAL GOOGLE SHEETS ===');

  // 1. Health check & Database Setup
  const ping = await callApi('system.ping', '', {});
  assert.strictEqual(ping.ok, true, 'system.ping must succeed');
  console.log('[PASS] 1. system.ping:', ping.data.version);

  const setup = await callApi('system.setup', '', {});
  assert.strictEqual(setup.ok, true, 'system.setup must succeed');
  console.log('[PASS] 2. system.setup verified sheets:', setup.data.verified_sheets.length);

  // 2. Register or Login Demo User (`demo@pfm.local` / `Demo@1234` / PIN `123456`)
  let demoToken = '';
  let demoUser = null;
  const regRes = await callApi('auth.register', '', {
    full_name: 'Demo Pro User (ข้อมูลทดสอบ)',
    email: 'demo@pfm.local',
    password: 'Demo@1234',
    pin: '123456',
    base_currency: 'THB',
    timezone: 'Asia/Bangkok'
  });

  if (regRes.ok) {
    demoToken = regRes.data.session_token;
    demoUser = regRes.data.user;
    console.log('[PASS] 3. Registered Demo User in real Users sheet:', demoUser.user_id);
  } else if (regRes.error && regRes.error.code === 'DUPLICATE_EMAIL') {
    const loginRes = await callApi('auth.login', '', {
      email: 'demo@pfm.local',
      auth_mode: 'password',
      password: 'Demo@1234'
    });
    assert.strictEqual(loginRes.ok, true, 'Demo user password login must succeed');
    demoToken = loginRes.data.session_token;
    demoUser = loginRes.data.user;
    console.log('[PASS] 3. Logged in existing Demo User:', demoUser.user_id);
  } else {
    throw new Error('Unexpected auth.register failure: ' + JSON.stringify(regRes));
  }

  // Verify PIN Login works
  const pinLoginRes = await callApi('auth.login', '', {
    email: 'demo@pfm.local',
    auth_mode: 'pin',
    pin: '123456'
  });
  assert.strictEqual(pinLoginRes.ok, true, 'PIN login must succeed');
  demoToken = pinLoginRes.data.session_token;
  console.log('[PASS] 4. Verified 6-Digit PIN Login in Users sheet');

  // 3. Create Accounts (Bank, Cash, Credit Card)
  const existingAccRes = await callApi('accounts.list', demoToken, {});
  assert.strictEqual(existingAccRes.ok, true);
  let bankAcc, cashAcc, ccAcc;

  if (existingAccRes.data.accounts.length === 0) {
    const bRes = await callApi('accounts.create', demoToken, {
      account_name: 'กสิกรไทย ออมทรัพย์หลัก (KBANK)',
      account_type: 'bank',
      currency: 'THB',
      opening_balance: 50000,
      institution_name: 'KBANK',
      account_number_masked: 'xxxx-8899',
      color: '#10B981'
    });
    assert.strictEqual(bRes.ok, true);
    bankAcc = bRes.data.account;

    const cRes = await callApi('accounts.create', demoToken, {
      account_name: 'กระเป๋าเงินสดประจำวัน',
      account_type: 'cash',
      currency: 'THB',
      opening_balance: 3000,
      color: '#F59E0B'
    });
    assert.strictEqual(cRes.ok, true);
    cashAcc = cRes.data.account;

    const ccRes = await callApi('accounts.create', demoToken, {
      account_name: 'บัตรเครดิต KTC Platinum',
      account_type: 'credit_card',
      currency: 'THB',
      opening_balance: 0,
      credit_limit: 80000,
      billing_day: 25,
      due_day: 10,
      institution_name: 'KTC',
      account_number_masked: 'xxxx-4512',
      color: '#EF4444'
    });
    assert.strictEqual(ccRes.ok, true);
    ccAcc = ccRes.data.account;
    console.log('[PASS] 5. Created 3 real accounts in Google Sheets:', bankAcc.account_id, cashAcc.account_id, ccAcc.account_id);
  } else {
    bankAcc = existingAccRes.data.accounts[0];
    cashAcc = existingAccRes.data.accounts[1] || bankAcc;
    ccAcc = existingAccRes.data.accounts[2] || bankAcc;
    console.log('[PASS] 5. Loaded existing accounts from Google Sheets');
  }

  // 4. Create Transactions (Income, Expense, Transfer, Refund) & verify duplicate prevention
  const ikIncome = 'test_ik_inc_20261001';
  const incTxRes = await callApi('transactions.create', demoToken, {
    tx_type: 'income',
    tx_date: '2026-10-01',
    tx_time: '09:00',
    account_id: bankAcc.account_id,
    category_id: 'cat_inc_salary',
    amount: 45000,
    merchant: 'บริษัท เทคโนโลยี จำกัด',
    description: 'เงินเดือนประจำเดือนตุลาคม 2026',
    tags: 'salary,october',
    idempotency_key: ikIncome
  });
  assert.strictEqual(incTxRes.ok, true, 'Income tx creation must succeed');

  // Replay exact same idempotency_key -> must return idempotent_replay without double-counting!
  const replayRes = await callApi('transactions.create', demoToken, {
    tx_type: 'income',
    tx_date: '2026-10-01',
    tx_time: '09:00',
    account_id: bankAcc.account_id,
    category_id: 'cat_inc_salary',
    amount: 45000,
    merchant: 'บริษัท เทคโนโลยี จำกัด',
    description: 'เงินเดือนประจำเดือนตุลาคม 2026',
    idempotency_key: ikIncome
  });
  assert.strictEqual(replayRes.ok, true);
  assert.strictEqual(replayRes.data.idempotent_replay, true, 'Must detect idempotent replay');
  console.log('[PASS] 6. Verified Idempotency Key duplicate prevention');

  // Create Expense transaction
  const expTxRes = await callApi('transactions.create', demoToken, {
    tx_type: 'expense',
    tx_date: '2026-10-03',
    tx_time: '19:30',
    account_id: bankAcc.account_id,
    category_id: 'cat_exp_housing',
    subcategory_id: 'cat_exp_housing_rent',
    amount: 8500,
    merchant: 'ค่าเช่าคอนโด ลุมพินี',
    description: 'ค่าเช่าประจำเดือน ต.ค.',
    tags: 'rent,housing',
    receipt_url: 'https://drive.google.com/file/d/sample-receipt',
    idempotency_key: 'test_ik_exp_rent_20261003'
  });
  assert.strictEqual(expTxRes.ok, true);

  // Create Internal Transfer (Bank -> Cash 2,000 THB)
  const trfTxRes = await callApi('transactions.create', demoToken, {
    tx_type: 'transfer',
    tx_date: '2026-10-04',
    tx_time: '10:15',
    account_id: bankAcc.account_id,
    to_account_id: cashAcc.account_id,
    category_id: 'cat_trf_internal',
    amount: 2000,
    merchant: 'ถอนเงินสดตู้ ATM กสิกรไทย',
    description: 'โอนจากบัญชีธนาคารเข้ากระเป๋าเงินสด',
    tags: 'atm,transfer',
    idempotency_key: 'test_ik_trf_20261004'
  });
  assert.strictEqual(trfTxRes.ok, true);

  // Create Refund Transaction (Refund 500 THB)
  const refTxRes = await callApi('transactions.create', demoToken, {
    tx_type: 'refund',
    tx_date: '2026-10-05',
    tx_time: '15:00',
    account_id: bankAcc.account_id,
    category_id: 'cat_exp_housing',
    amount: 500,
    merchant: 'คืนเงินส่วนลดค่าส่วนกลางคอนโด',
    description: 'ได้รับเงินคืนค่ามัดจำคีย์การ์ด',
    tags: 'refund',
    idempotency_key: 'test_ik_ref_20261005'
  });
  assert.strictEqual(refTxRes.ok, true);
  console.log('[PASS] 7. Created Income, Expense, Transfer, and Refund transactions in Google Sheets');

  // 5. Test CSV Import Preview & Commit with Duplicate Detection
  const previewRes = await callApi('transactions.importCsvPreview', demoToken, {
    account_id: cashAcc.account_id,
    rows: [
      { tx_date: '2026-10-06', tx_type: 'expense', amount: 120, merchant: '7-Eleven', description: 'ซื้อของใช้ส่วนตัว' },
      { tx_date: '2026-10-07', tx_type: 'expense', amount: 60, merchant: 'BTS SkyTrain', description: 'ค่าเดินทางรถไฟฟ้า' }
    ]
  });
  assert.strictEqual(previewRes.ok, true);
  assert.strictEqual(previewRes.data.summary.total_rows, 2);

  const commitRes = await callApi('transactions.importCsvCommit', demoToken, {
    account_id: cashAcc.account_id,
    file_name: 'acceptance_test_statement.csv',
    skip_duplicates: true,
    items: previewRes.data.items
  });
  assert.strictEqual(commitRes.ok, true);
  console.log('[PASS] 8. Verified CSV Import Preview & Commit (Imported:', commitRes.data.imported_count, ', Skipped Duplicates:', commitRes.data.skipped_duplicates, ')');

  // 6. Verify Dashboard Calculation & Transfer Non-Double-Counting
  const dashRes = await callApi('dashboard.summary', demoToken, {
    start_date: '2026-10-01',
    end_date: '2026-10-31'
  });
  assert.strictEqual(dashRes.ok, true);
  const kpis = dashRes.data.kpis;
  // Expected:
  // Income = 45,000 (transfer of 2,000 is NOT added to income!)
  // Gross Expense = 8,500 + 120 + 60 = 8,680 (transfer of 2,000 is NOT added to expense!)
  // Refund = 500 -> Net Expense = 8,680 - 500 = 8,180
  // Net Cashflow = 45,000 - 8,180 = 36,820
  assert.strictEqual(kpis.period_income, 45000, 'Dashboard income must equal 45,000 without transfer');
  assert.strictEqual(kpis.period_expense, 8180, 'Dashboard net expense must equal 8,180 (gross 8,680 - refund 500) without transfer');
  assert.strictEqual(kpis.period_transfers_volume, 2000, 'Transfer volume must be tracked separately as 2,000');
  assert.strictEqual(kpis.period_net_cashflow, 36820, 'Net cashflow must equal 36,820');
  console.log('[PASS] 9. Verified Dashboard KPI math & Transfer exclusion:', kpis);

  // 7. Verify Multi-User Isolation (User 2 cannot see Demo User's accounts or transactions)
  let user2Token = '';
  const u2Reg = await callApi('auth.register', '', {
    full_name: 'Alice Isolated User',
    email: 'alice.isolation@pfm.local',
    password: 'Alice@1234',
    base_currency: 'THB'
  });
  if (u2Reg.ok) {
    user2Token = u2Reg.data.session_token;
  } else {
    const u2Login = await callApi('auth.login', '', {
      email: 'alice.isolation@pfm.local',
      password: 'Alice@1234'
    });
    user2Token = u2Login.data.session_token;
  }

  const u2Accs = await callApi('accounts.list', user2Token, {});
  const u2Txs = await callApi('transactions.list', user2Token, {});
  assert.strictEqual(u2Accs.data.accounts.length, 0, 'Isolated user must see 0 accounts of Demo user');
  assert.strictEqual(u2Txs.data.transactions.length, 0, 'Isolated user must see 0 transactions of Demo user');
  console.log('[PASS] 10. Verified strict Multi-User Isolation');

  // 8. Verify Backup Export & Audit Logs
  const backupRes = await callApi('system.backupExport', demoToken, {});
  assert.strictEqual(backupRes.ok, true);
  assert.ok(backupRes.data.backup.tables.Accounts.length >= 3);
  assert.ok(backupRes.data.backup.tables.Transactions.length >= 6);

  const logsRes = await callApi('system.auditLogs', demoToken, { limit: 10 });
  assert.strictEqual(logsRes.ok, true);
  assert.ok(logsRes.data.audit_logs.length > 0);
  console.log('[PASS] 11. Verified Backup JSON Export and Audit Logs in Google Sheets');

  console.log('=== ALL PHASE 1 LIVE ACCEPTANCE TESTS PASSED SUCCESSFULLY ===');
}

runTests().catch(err => {
  console.error('ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});

