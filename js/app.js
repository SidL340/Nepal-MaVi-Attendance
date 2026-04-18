/**
 * Main App Controller
 * Handles: splash screen, teacher selection, navigation, dashboard, settings
 */

// ── Global current user (null before login) ─────────────────────────────
var currentUser = null;

// ── Global utils ─────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', icon = 'ℹ️', duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-msg">${msg}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(toast);
  setTimeout(() => toast.style.opacity = '0', duration - 400);
  setTimeout(() => toast.remove(), duration);
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  // Close sidebar on mobile
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
  }

  // Update topbar title
  const titles = {
    dashboard: '📊 ड्यासबोर्ड',
    attendance: '✅ हाजिरी',
    students: '🎒 विद्यार्थी',
    reports: '📈 प्रतिवेदन',
    import: '📤 आयात/निर्यात',
    settings: '⚙️ सेटिङ',
  };
  const titleEl = document.getElementById('topbar-page-title');
  if (titleEl) titleEl.textContent = titles[page] || page;

  // Reload page data if needed
  if (page === 'attendance') AttendancePage.loadAttendance();
  if (page === 'students') StudentsPage.loadStudents();
  if (page === 'reports') ReportsPage.generateReport();
  if (page === 'dashboard') DashboardPage.refresh();
  if (page === 'import') ImportPage.buildClassSelector(); // always refresh class list
}

// ── Dashboard ────────────────────────────────────────────────────────────────
const DashboardPage = (() => {
  const $ = id => document.getElementById(id);

  function refresh() {
    const today = NepaliCalendar.today();
    const settings = DB.getSettings();

    // Today's stats across all classes
    let totalPresent = 0, totalAbsent = 0, totalLate = 0, totalStudents = 0;
    const dateStr = NepaliCalendar.format(today);

    CLASSES.forEach(cls => {
      const students = DB.getStudents(cls.id);
      totalStudents += students.length;
      const att = DB.getAttendance(cls.id, dateStr);
      if (att) {
        Object.values(att.records).forEach(s => {
          if (s === 'P') totalPresent++;
          else if (s === 'A') totalAbsent++;
          else if (s === 'L') { totalPresent++; totalLate++; }
        });
      }
    });

    setEl('dash-total-students', totalStudents);
    setEl('dash-today-present', totalPresent);
    setEl('dash-today-absent', totalAbsent);


    // Recent attendance
    renderRecentActivity();
    renderClassOverview(today);
    updateSidebarDate();
  }

  function setEl(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  function renderClassOverview(today) {
    const el = $('class-overview-list');
    if (!el) return;
    const dateStr = NepaliCalendar.format(today);

    const rows = CLASSES.map(cls => {
      const students = DB.getStudents(cls.id);
      if (students.length === 0) return null;
      const att = DB.getAttendance(cls.id, dateStr);
      let present = 0, absent = 0;
      if (att) {
        Object.values(att.records).forEach(s => {
          if (s === 'P' || s === 'L') present++;
          else if (s === 'A') absent++;
        });
      } else {
        present = students.length; // Default all present
      }
      const pct = Math.round((present / students.length) * 100);
      const pctClass = pct >= 90 ? 'success' : pct >= 75 ? 'warning' : 'danger';
      return `
        <div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--border-subtle)">
          <div style="font-size:0.9rem;font-weight:600;flex:1">${cls.labelNp}<br>
            <span style="font-size:0.75rem;color:var(--text-muted)">${students.length} विद्यार्थी</span>
          </div>
          <div style="width:80px">
            <div class="pct-bar"><div class="pct-bar-fill ${pctClass}" style="width:${pct}%"></div></div>
          </div>
          <div class="text-${pctClass}" style="font-weight:700;font-size:0.9rem;width:44px;text-align:right">${pct}%</div>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('attendance')">📋</button>
        </div>`;
    }).filter(Boolean);

    el.innerHTML = rows.length > 0
      ? rows.join('')
      : `<div class="text-muted text-center" style="padding:32px">No students added yet.</div>`;
  }

  function renderRecentActivity() {
    const el = $('recent-activity');
    if (!el) return;
    const school = DB.getSchool();
    const today = NepaliCalendar.today();

    // Find last 5 saved attendance records
    const allAtt = {};
    CLASSES.forEach(cls => {
      const recs = DB.getAllAttendanceForClass(cls.id);
      recs.forEach(r => { allAtt[r.date + cls.id] = { ...r, classId: cls.id }; });
    });

    const sorted = Object.values(allAtt)
      .sort((a, b) => b.savedAt?.localeCompare(a.savedAt || ''))
      .slice(0, 5);

    if (sorted.length === 0) {
      el.innerHTML = `<div class="text-muted text-center" style="padding:32px">हाजिरी अझैं मार्क गरिएको छैन।</div>`;
      return;
    }

    el.innerHTML = sorted.map(item => {
      const cls = CLASSES.find(c => c.id === item.classId);
      const recs = item.records || {};
      const present = Object.values(recs).filter(s => s === 'P' || s === 'L').length;
      const absent = Object.values(recs).filter(s => s === 'A').length;
      const bsDate = NepaliCalendar.parse(item.date);
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-subtle)">
          <div style="width:38px;height:38px;background:var(--bg-raised);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">📋</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.9rem">${cls?.labelNp || item.classId}</div>
            <div style="font-size:0.78rem;color:var(--text-muted)">${NepaliCalendar.formatNepali(bsDate)}</div>
          </div>
          <div style="text-align:right;font-size:0.85rem">
            <span class="text-success">✓ ${present}</span>  
            <span class="text-danger">✗ ${absent}</span>
          </div>
        </div>`;
    }).join('');
  }

  return { refresh };
})();

// ── Sidebar date display ──────────────────────────────────────────────────────
function updateSidebarDate() {
  const today = NepaliCalendar.today();
  const months = NepaliCalendar.getMonths();
  const dayEl = document.getElementById('sidebar-day');
  const moEl = document.getElementById('sidebar-month-year');
  const wkEl = document.getElementById('sidebar-weekday');

  if (dayEl) dayEl.textContent = today.day;
  if (moEl) moEl.textContent = `${months[today.month - 1]?.np} ${today.year} BS`;
  if (wkEl) wkEl.textContent = NepaliCalendar.getDayOfWeek(today, 'np');
}

// ── Splash / Teacher select ───────────────────────────────────────────────────
// -- Login system -----------------------------------------------------------------
function initLogin() {
  var unEl  = document.getElementById('login-username');
  var pwEl  = document.getElementById('login-password');
  var btnEl = document.getElementById('login-btn');
  var tgBtn = document.getElementById('toggle-pw-btn');
  if (btnEl) btnEl.addEventListener('click', handleLogin);
  document.getElementById('login-password').addEventListener('keyup', function(e) {
    if (e.key === 'Enter') attemptLogin();
  });

  const syncBtn = document.getElementById('sync-cloud-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async function() {
      const originalText = syncBtn.textContent;
      syncBtn.textContent = '⏳ Downloading from Cloud...';
      syncBtn.disabled = true;
      const count = await DB.syncFromCloud();
      if (count >= 0) {
        syncBtn.textContent = `✅ Synced ${count} records!`;
        if (count > 0) setTimeout(() => window.location.reload(), 1500);
      } else {
        syncBtn.textContent = '❌ Sync Failed (Check Internet)';
      }
      setTimeout(() => { syncBtn.textContent = originalText; syncBtn.disabled = false; }, 3000);
    });
  }
}

function togglePasswordVisibility() {
  var pwEl  = document.getElementById('login-password');
  var tgBtn = document.getElementById('toggle-pw-btn');
  var unEl  = document.getElementById('login-username');
  tgBtn.addEventListener('click', function() {
    var isPass = pwEl.type === 'password';
    pwEl.type  = isPass ? 'text' : 'password';
    tgBtn.textContent = isPass ? 'Hide' : 'Show';
  });
  if (unEl) unEl.focus();
}

function handleLogin() {
  var id  = (document.getElementById('login-username').value || '').trim();
  var pwd = (document.getElementById('login-password').value || '');
  var err = document.getElementById('login-error');
  if (!id || !pwd) { err.textContent = 'ID and Password are required.'; err.classList.remove('hidden'); return; }
  var user = DB.verifyLogin(id, pwd);
  if (!user) {
    err.textContent = 'Invalid User ID or Password. Please try again.';
    err.classList.remove('hidden');
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
    return;
  }
  err.classList.add('hidden');
  DB.setActiveUser(user.id);
  onLoginSuccess(user);
}
function onLoginSuccess(user) {
  currentUser = user;
  var cls = CLASSES.find(function(c) { return c.id === user.classId; });
  document.getElementById('sidebar-teacher-name').textContent = user.role === 'admin' ? 'Administrator' : user.nameEn;
  document.getElementById('sidebar-teacher-role').textContent = user.role === 'admin' ? 'System Admin' : (cls ? cls.label + ' Teacher' : 'Teacher');
  document.getElementById('sidebar-teacher-avatar').textContent = user.role === 'admin' ? 'A' : user.id.replace('class', '');
  var importNav   = document.querySelector('.nav-item[data-page="import"]');
  var settingsNav = document.querySelector('.nav-item[data-page="settings"]');
  if (importNav)   importNav.style.display  = user.role === 'admin' ? '' : 'none';
  if (settingsNav) settingsNav.style.display = user.role === 'admin' ? '' : 'none';
  document.getElementById('splash-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  navigateTo('dashboard');
  var _safe = function(fn, nm) { try { fn(); } catch(e) { console.warn(nm + ' init error:', e); } };
  _safe(function() { AttendancePage.init(); }, 'AttendancePage');
  _safe(function() { StudentsPage.init();   }, 'StudentsPage');
  _safe(function() { ReportsPage.init();    }, 'ReportsPage');
  _safe(function() { ImportPage.init();     }, 'ImportPage');
  _safe(function() { initSettings();        }, 'Settings');
  DashboardPage.refresh();
  updateSidebarDate();
}
function logout() {
  DB.clearActiveUser();
  currentUser = null;
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('splash-screen').classList.remove('hidden');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').classList.add('hidden');
  initLogin();
}
var _resetTargetId = null;
function openResetPwModal(userId) {
  _resetTargetId = userId;
  var u = DB.getUser(userId);
  document.getElementById('reset-pw-target-name').textContent = u ? u.nameEn + ' (' + u.id + ')' : userId;
  document.getElementById('reset-pw-new').value = '';
  document.getElementById('reset-pw-confirm').value = '';
  document.getElementById('reset-pw-modal').classList.remove('hidden');
  document.getElementById('reset-pw-new').focus();
}
function adminResetPassword() {
  var np = document.getElementById('reset-pw-new').value;
  var cp = document.getElementById('reset-pw-confirm').value;
  if (!np) { showToast('Password cannot be empty!', 'error', 'x'); return; }
  if (np !== cp) { showToast('Passwords do not match!', 'error', 'x'); return; }
  DB.updatePassword(_resetTargetId, np);
  document.getElementById('reset-pw-modal').classList.add('hidden');
  showToast('Password reset successfully!', 'success', 'OK');
  renderUsersTable();
}
function renderUsersTable() {
  var container = document.getElementById('users-table-container');
  if (!container) return;
  var users = DB.getUsers().filter(function(u) { return u.role === 'teacher'; });
  container.innerHTML = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.88rem"><thead><tr style="background:rgba(192,57,43,0.08)"><th style="padding:10px 14px;text-align:left">User ID</th><th style="padding:10px 14px;text-align:left">Teacher</th><th style="padding:10px 14px;text-align:left">Class</th><th style="padding:10px 14px;text-align:left">Action</th></tr></thead><tbody>' +
    users.map(function(u) {
      var cls = CLASSES.find(function(c) { return c.id === u.classId; });
      return '<tr style="border-bottom:1px solid var(--border-subtle)"><td style="padding:10px 14px;font-family:monospace">' + u.id + '</td><td style="padding:10px 14px;font-weight:600">' + u.nameEn + '</td><td style="padding:10px 14px">' + (cls ? cls.label : u.classId) + '</td><td style="padding:10px 14px"><button class="btn btn-ghost btn-sm" onclick="openResetPwModal(\''+u.id+'\')">Reset Password</button></td></tr>';
    }).join('') + '</tbody></table></div>';
}
document.addEventListener('DOMContentLoaded', () => {
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  // Nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Mobile menu
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Topbar manual sync button
  const tbSyncBtn = document.getElementById('topbar-sync-btn');
  if (tbSyncBtn) {
    tbSyncBtn.addEventListener('click', async () => {
      const originalText = tbSyncBtn.textContent;
      tbSyncBtn.textContent = '⏳';
      tbSyncBtn.disabled = true;
      const count = await DB.syncFromCloud();
      if (count >= 0) {
        showToast('Database Synchronized! (' + count + ' items)', 'success', '✅');
        setTimeout(() => window.location.reload(), 800);
      } else {
        showToast('Sync failed. Check internet.', 'error', '❌');
      }
      tbSyncBtn.textContent = originalText;
      tbSyncBtn.disabled = false;
    });
  }

  // Start real-time live sync
  if (window.DB && DB.startLiveSync) {
    DB.startLiveSync(() => {
      // Only show toast and refresh if a user is actively logged in and looking at a page
      if (DB.getActiveUser()) {
        showToast('Live Update Received ☁️', 'info', '🔄', 2500);
        const activePage = document.querySelector('.page.active');
        if (activePage) {
           const pid = activePage.id.replace('page-', '');
           if (pid === 'dashboard' && window.DashboardPage) DashboardPage.refresh();
           if (pid === 'attendance' && window.AttendancePage) AttendancePage.loadAttendance();
           if (pid === 'students' && window.StudentsPage) StudentsPage.loadStudents();
           if (pid === 'reports' && window.ReportsPage) ReportsPage.generateReport();
        }
      }
    });
  }

  // Check if already logged in (session restore)
  const active = DB.getActiveUser();
  if (active) {
    onLoginSuccess(active);
  } else {
    initLogin();
  }
});


function initSettings() {
  const school    = DB.getSchool();
  const settings  = DB.getSettings();

  document.getElementById('school-name-input').value  = school.name     || '';
  document.getElementById('school-name-en').value     = school.nameEn   || '';
  document.getElementById('school-emis-code').value   = school.emis_code|| '';
  document.getElementById('school-district').value    = school.district  || '';
  document.getElementById('school-principal').value   = school.principal || '';
  document.getElementById('academic-year-input').value= settings.academicYear || 2083;

  // Prevent duplicate listeners
  const saveBtn = document.getElementById('save-school-btn');
  const newBtn  = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newBtn, saveBtn);
  newBtn.addEventListener('click', saveSchoolSettings);

  // User management visibility (admin only)
  const umSection = document.getElementById('user-mgmt-section');
  if (umSection) umSection.style.display = (currentUser && currentUser.role === 'admin') ? '' : 'none';
  if (currentUser && currentUser.role === 'admin') renderUsersTable();

  // Change own password button
  const cpBtn = document.getElementById('change-pw-btn');
  if (cpBtn) {
    const newCpBtn = cpBtn.cloneNode(true);
    cpBtn.parentNode.replaceChild(newCpBtn, cpBtn);
    newCpBtn.addEventListener('click', function() {
      const cur = document.getElementById('chpw-current').value;
      const nw  = document.getElementById('chpw-new').value;
      const cfm = document.getElementById('chpw-confirm').value;
      if (!cur || !nw) { showToast('All fields are required.', 'error', 'x'); return; }
      if (!DB.verifyLogin(currentUser.id, cur)) { showToast('Current password is incorrect!', 'error', 'x'); return; }
      if (nw !== cfm)  { showToast('New passwords do not match!', 'error', 'x'); return; }
      DB.updatePassword(currentUser.id, nw);
      document.getElementById('chpw-current').value = '';
      document.getElementById('chpw-new').value     = '';
      document.getElementById('chpw-confirm').value = '';
      showToast('Password changed successfully!', 'success', 'OK');
    });
  }

  updateSidebarSchool();
}

function saveSchoolSettings() {
  const school = {
    name:      document.getElementById('school-name-input').value.trim() || 'सरकारी विद्यालय',
    nameEn:    document.getElementById('school-name-en').value.trim(),
    emis_code: document.getElementById('school-emis-code').value.trim(),
    district:  document.getElementById('school-district').value.trim(),
    principal: document.getElementById('school-principal').value.trim(),
    address: '',
  };
  const academicYear = parseInt(document.getElementById('academic-year-input').value) || 2083;
  DB.saveSchool(school);
  DB.saveSettings({ academicYear });
  updateSidebarSchool();
  showToast('सेटिङ सुरक्षित गरियो!', 'success', '✅');
}

function updateSidebarSchool() {
  const school = DB.getSchool();
  const el = document.getElementById('sidebar-school-name');
  if (el) el.textContent = school.name || 'सरकारी विद्यालय';
}
