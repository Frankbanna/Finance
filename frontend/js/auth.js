/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/auth.js
 * Description: Handles Login (Email + Password / PIN), Registration, Logout, and Profile Security.
 */

window.PFM_AUTH = {
  currentMode: 'login', // 'login' | 'register'
  loginCredMode: 'password', // 'password' | 'pin'

  init: function() {
    const loginForm = document.getElementById('authLoginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLoginSubmit(e));
    }

    const regForm = document.getElementById('authRegisterForm');
    if (regForm) {
      regForm.addEventListener('submit', (e) => this.handleRegisterSubmit(e));
    }

    const profileForm = document.getElementById('settingsProfileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => this.handleProfileUpdate(e));
    }
  },

  switchAuthTab: function(tab) {
    this.currentMode = tab;
    document.getElementById('authLoginForm').classList.toggle('d-none', tab !== 'login');
    document.getElementById('authRegisterForm').classList.toggle('d-none', tab !== 'register');
    document.getElementById('tabBtnLogin').classList.toggle('btn-primary', tab === 'login');
    document.getElementById('tabBtnLogin').classList.toggle('btn-outline-secondary', tab !== 'login');
    document.getElementById('tabBtnRegister').classList.toggle('btn-primary', tab === 'register');
    document.getElementById('tabBtnRegister').classList.toggle('btn-outline-secondary', tab !== 'register');
  },

  switchLoginCredentialMode: function(mode) {
    this.loginCredMode = mode;
    document.getElementById('loginPasswordGroup').classList.toggle('d-none', mode !== 'password');
    document.getElementById('loginPinGroup').classList.toggle('d-none', mode !== 'pin');
    document.getElementById('btnCredPassword').classList.toggle('active', mode === 'password');
    document.getElementById('btnCredPin').classList.toggle('active', mode === 'pin');
  },

  handleLoginSubmit: async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnLoginSubmit');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const pin = document.getElementById('loginPin').value.trim();

    try {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>กำลังตรวจสอบสิทธิ์...';

      const res = await PFM_API.call('auth.login', {
        email: email,
        auth_mode: this.loginCredMode,
        password: password,
        pin: pin
      });

      PFM_API.setSession(res.session_token, res.user);
      PFM_APP.showToast('เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ' + res.user.full_name, 'success');
      await PFM_APP.bootstrapAuthenticatedSession(res.user);
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>เข้าสู่ระบบ';
    }
  },

  handleRegisterSubmit: async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnRegisterSubmit');
    const fullName = document.getElementById('regFullName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const pin = document.getElementById('regPin').value.trim();
    const baseCurrency = document.getElementById('regCurrency').value;

    try {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>กำลังสร้างบัญชี...';

      const res = await PFM_API.call('auth.register', {
        full_name: fullName,
        email: email,
        password: password,
        pin: pin,
        base_currency: baseCurrency,
        timezone: 'Asia/Bangkok'
      });

      PFM_API.setSession(res.session_token, res.user);
      PFM_APP.showToast('สร้างบัญชีผู้ใช้สำเร็จ!', 'success');
      await PFM_APP.bootstrapAuthenticatedSession(res.user);
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-person-plus me-2"></i>สมัครสมาชิกและเข้าใช้งาน';
    }
  },

  fillDemoAccount: function() {
    this.switchAuthTab('login');
    this.switchLoginCredentialMode('password');
    document.getElementById('loginEmail').value = 'demo@pfm.local';
    document.getElementById('loginPassword').value = 'Demo@1234';
  },

  logout: async function() {
    try {
      await PFM_API.call('auth.logout', {});
    } catch (e) {
      // Ignore logout network error and clear local session
    }
    PFM_API.clearSession();
    PFM_APP.showAuthScreen();
    PFM_APP.showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
  },

  handleProfileUpdate: async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveProfile');
    try {
      btn.disabled = true;
      const payload = {
        full_name: document.getElementById('profFullName').value.trim(),
        base_currency: document.getElementById('profBaseCurrency').value,
        timezone: document.getElementById('profTimezone').value
      };

      const curPwd = document.getElementById('profCurrentPassword').value;
      const newPwd = document.getElementById('profNewPassword').value;
      const newPin = document.getElementById('profNewPin').value.trim();

      if (newPwd) {
        payload.current_password = curPwd;
        payload.new_password = newPwd;
      }
      if (newPin !== '') {
        payload.new_pin = newPin;
      }

      const res = await PFM_API.call('auth.updateProfile', payload);
      PFM_API.setSession(null, res.user);
      PFM_APP.currentUser = res.user;
      PFM_APP.updateUserHeader();
      document.getElementById('profCurrentPassword').value = '';
      document.getElementById('profNewPassword').value = '';
      document.getElementById('profNewPin').value = '';
      PFM_APP.showToast('บันทึกการตั้งค่าบัญชีและความปลอดภัยเรียบร้อยแล้ว', 'success');
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
    }
  }
};

