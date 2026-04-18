/**
 * Attendance Module
 * Handles marking, saving, retrieving attendance
 */

const AttendancePage = (() => {

  let currentClass = '';
  let currentDate  = '';   // 'YYYY-MM-DD' in BS
  let records      = {};   // { studentId: 'P'|'A' }
  let students     = [];
  let unsaved      = false;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    buildDateSelectors();
    buildClassSelector();

    // Set defaults to today
    const today = NepaliCalendar.today();
    currentDate = NepaliCalendar.format(today);
    setDateSelectorValues(today);

    $('att-class-select').addEventListener('change', onClassChange);
    $('att-load-btn').addEventListener('click', loadAttendance);
    $('att-save-btn').addEventListener('click', saveAttendance);
    $('att-mark-all-present').addEventListener('click', markAllPresent);
    $('att-mark-all-absent').addEventListener('click', markAllAbsent);
    $('att-search').addEventListener('input', filterStudents);
    $('att-print-btn').addEventListener('click', printAttendance);
    $('att-export-day-btn').addEventListener('click', exportDayToExcel);

    // Date selector listeners
    ['att-year', 'att-month', 'att-day'].forEach(id => {
      $(id).addEventListener('change', onDateChange);
    });

    // Load last used class or first class (only if not restricted teacher)
    if (window.currentUser && window.currentUser.role === 'teacher') {
      currentClass = window.currentUser.classId;
      $('att-class-select').value = currentClass;
    } else {
      const lastClass = localStorage.getItem('nmv_last_class') || CLASSES[0].id;
      $('att-class-select').value = lastClass;
      currentClass = lastClass;
    }

    loadAttendance();
  }

  // ── Date selectors ────────────────────────────────────────────────────────
  function buildDateSelectors() {
    const yearSel  = $('att-year');
    const monthSel = $('att-month');
    const months   = NepaliCalendar.getMonths();

    // Years
    yearSel.innerHTML = '';
    NepaliCalendar.getAvailableYears().forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y} BS`;
      yearSel.appendChild(opt);
    });

    // Months
    monthSel.innerHTML = '';
    months.forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i + 1;
      opt.textContent = `${m.np} (${m.en})`;
      monthSel.appendChild(opt);
    });
  }

  function buildDaySelector(year, month) {
    const daySel = $('att-day');
    const days   = NepaliCalendar.daysInBSMonth(year, month);
    daySel.innerHTML = '';
    for (let d = 1; d <= days; d++) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      daySel.appendChild(opt);
    }
  }

  function setDateSelectorValues(bsDate) {
    $('att-year').value  = bsDate.year;
    $('att-month').value = bsDate.month;
    buildDaySelector(bsDate.year, bsDate.month);
    $('att-day').value   = bsDate.day;
    currentDate = NepaliCalendar.format(bsDate);
    updateDateDisplay();
  }

  function onDateChange() {
    const y = parseInt($('att-year').value);
    const m = parseInt($('att-month').value);
    buildDaySelector(y, m);
    const d = parseInt($('att-day').value);
    currentDate = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    updateDateDisplay();
  }

  function updateDateDisplay() {
    const bsDate = NepaliCalendar.parse(currentDate);
    const nlabel = NepaliCalendar.formatNepali(bsDate);
    const elabel = NepaliCalendar.formatEnglish(bsDate);
    const weekday= NepaliCalendar.getDayOfWeek(bsDate, 'np');
    $('att-date-display').textContent = `${nlabel} (${weekday})`;
    $('att-date-display-en').textContent = elabel;
  }

  // ── Class selector ────────────────────────────────────────────────────────
  function buildClassSelector() {
    const sel = $('att-class-select');
    sel.innerHTML = '';
    CLASSES.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls.id;
      opt.textContent = `${cls.labelNp} (${cls.label})`;
      sel.appendChild(opt);
    });
    // Lock class teacher to their class
    if (window.currentUser && window.currentUser.role === 'teacher') {
      sel.value    = window.currentUser.classId;
      sel.disabled = true;
      currentClass = window.currentUser.classId;
    }
  }

  function onClassChange() {
    currentClass = $('att-class-select').value;
    localStorage.setItem('nmv_last_class', currentClass);
    loadAttendance();
  }

  // ── Load attendance ───────────────────────────────────────────────────────
  function loadAttendance() {
    if (!currentClass || !currentDate) return;

    students = DB.getStudents(currentClass);
    const stored = DB.getAttendance(currentClass, currentDate);

    // Default all to Present
    records = {};
    students.forEach(s => { records[s.id] = 'P'; });

    // Overlay saved records
    if (stored && stored.records) {
      Object.assign(records, stored.records);
    }

    unsaved = false;
    renderStudentList();
    updateStats();
    updateDateDisplay();
    updateClassDisplay();
  }

  function updateClassDisplay() {
    const cls = CLASSES.find(c => c.id === currentClass);
    if (cls) {
      $('att-class-display').textContent = `${cls.labelNp} — ${cls.label}`;
    }
  }

  // ── Render student list ───────────────────────────────────────────────────
  function renderStudentList() {
    const container = $('student-list');
    const query = ($('att-search').value || '').toLowerCase();

    const filtered = students.filter(s =>
      s.name.toLowerCase().includes(query) ||
      (s.id || '').toLowerCase().includes(query) ||
      (s.nameEn || '').toLowerCase().includes(query)
    );

    if (filtered.length === 0 && students.length === 0) {
      container.innerHTML = `
        <div class="no-students-msg">
          <div class="empty-icon">🎒</div>
          <h3>यस कक्षामा कुनै विद्यार्थी छैनन्</h3>
          <p>No students in this class. Go to the <strong>Students</strong> tab to add students.</p>
        </div>`;
      return;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="no-students-msg">
          <div class="empty-icon">🔍</div>
          <h3>कुनै विद्यार्थी फेला परेन</h3>
          <p>No students match your search.</p>
        </div>`;
      return;
    }

    container.innerHTML = filtered.map((s, idx) => {
      const status = records[s.id] || 'P';
      const rowCls = status === 'A' ? 'absent-row' : '';
      const genderIcon = s.gender === 'female' ? '👩' : s.gender === 'male' ? '👦' : '🧑';
      return `
        <div class="student-row ${rowCls}" data-student-id="${s.id}">
          <div class="roll-num">${idx + 1}</div>
          <div>
            <div class="student-name">${genderIcon} ${s.name}</div>
            <div class="student-id">ID: ${s.id}${s.nameEn ? '  ·  ' + s.nameEn : ''}</div>
          </div>
          <div class="student-meta">${s.dob ? 'DOB: ' + s.dob : ''}</div>
          <div class="att-toggle">
            ${['P','A'].map(st => `
              <button class="att-btn ${status === st ? 'active-'+st : ''}"
                      title="${ATTENDANCE_STATUS[st].labelEn}"
                      onclick="AttendancePage.setStatus('${s.id}', '${st}')">
                ${ATTENDANCE_STATUS[st].icon}
              </button>
            `).join('')}
          </div>
        </div>`;
    }).join('');
  }

  // ── Attendance actions ────────────────────────────────────────────────────
  function setStatus(studentId, status) {
    records[studentId] = status;
    unsaved = true;

    // Update just this row DOM
    const row = document.querySelector(`[data-student-id="${studentId}"]`);
    if (row) {
      row.className = `student-row ${status === 'A' ? 'absent-row' : ''}`;
      row.querySelectorAll('.att-btn').forEach((btn, i) => {
        const sta = ['P','A'][i];
        btn.className = `att-btn ${status === sta ? 'active-'+sta : ''}`;
      });
    }

    updateStats();
    updateSavedIndicator(false);

    // Auto-save after 1 second of inactivity
    clearTimeout(AttendancePage._saveTimer);
    AttendancePage._saveTimer = setTimeout(saveAttendance, 1500);
  }

  function markAllPresent() {
    students.forEach(s => { records[s.id] = 'P'; });
    unsaved = true;
    renderStudentList();
    updateStats();
    debouncedSave();
  }

  function markAllAbsent() {
    students.forEach(s => { records[s.id] = 'A'; });
    unsaved = true;
    renderStudentList();
    updateStats();
    debouncedSave();
  }

  function filterStudents() {
    renderStudentList();
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function saveAttendance() {
    if (!currentClass || !currentDate) return;
    DB.saveAttendance(currentClass, currentDate, records);
    unsaved = false;
    updateSavedIndicator(true);
    showToast('हाजिरी सुरक्षित गरियो!', 'success', '✅');
  }

  function debouncedSave() {
    clearTimeout(AttendancePage._saveTimer);
    AttendancePage._saveTimer = setTimeout(saveAttendance, 1500);
  }

  function updateSavedIndicator(saved) {
    const el = $('save-indicator');
    if (!el) return;
    if (saved) {
      el.innerHTML = `<span class="save-dot"></span> सुरक्षित गरियो`;
      el.style.color = 'var(--clr-present)';
    } else {
      el.innerHTML = `⏳ सुरक्षित हुँदैछ...`;
      el.style.color = 'var(--clr-late)';
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  function updateStats() {
    let P = 0, A = 0;
    Object.values(records).forEach(s => {
      if (s === 'P') P++;
      else if (s === 'A') A++;
    });
    const total = students.length;
    setStatEl('att-stat-present', P);
    setStatEl('att-stat-absent',  A);
    setStatEl('att-stat-total',   total);
  }

  function setStatEl(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  function printAttendance() {
    const cls = CLASSES.find(c => c.id === currentClass);
    const school = DB.getSchool();
    const bsDate = NepaliCalendar.parse(currentDate);

    const printContent = `
      <div class="print-header">
        <h2>${school.name}</h2>
        <p>हाजिरी पत्र | Attendance Sheet</p>
        <p>कक्षा: ${cls?.labelNp || currentClass} &nbsp;|&nbsp; मिति: ${NepaliCalendar.formatNepali(bsDate)}</p>
      </div>`;

    // Store print content and trigger print
    const old = document.title;
    document.title = `Attendance_${currentClass}_${currentDate}`;
    window.print();
    document.title = old;
  }

  // ── Export day to Excel ───────────────────────────────────────────────────
  function exportDayToExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel export library loading...', 'info', '⏳');
      return;
    }
    const cls = CLASSES.find(c => c.id === currentClass);
    const bsDate = NepaliCalendar.parse(currentDate);
    const rows = students.map((s, idx) => ({
      'Roll No': idx + 1,
      'Student ID': s.id,
      'Name (Nepali)': s.name,
      'Name (English)': s.nameEn || '',
      'Gender': s.gender || '',
      'Status': ATTENDANCE_STATUS[records[s.id] || 'P'].labelEn,
      'Status Code': records[s.id] || 'P',
      'Date (BS)': currentDate,
      'Class': cls?.label || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `Attendance_${currentClass}_${currentDate}.xlsx`);
    showToast('Excel file downloaded!', 'success', '📥');
  }

  return { init, setStatus, loadAttendance, saveAttendance, _saveTimer: null };
})();

