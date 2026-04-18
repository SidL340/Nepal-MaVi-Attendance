/**
 * Reports Module
 * Monthly attendance summaries, class-wise statistics, low-attendance alerts
 */
const ReportsPage = (() => {

  let currentClass = CLASSES[0].id;
  let currentYear  = 0;
  let currentMonth = 0;

  const $ = id => document.getElementById(id);

  function init() {
    const today = NepaliCalendar.today();
    currentYear  = today.year;
    currentMonth = today.month;

    buildControls();
    $('report-class').addEventListener('change', generateReport);
    $('report-year').addEventListener('change', generateReport);
    $('report-month').addEventListener('change', generateReport);
    $('export-report-btn').addEventListener('click', exportReport);
    $('print-report-btn').addEventListener('click', () => window.print());

    generateReport();
  }

  function buildControls() {
    // Class
    const clsSel = $('report-class');
    clsSel.innerHTML = '';
    CLASSES.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls.id;
      opt.textContent = `${cls.labelNp} (${cls.label})`;
      clsSel.appendChild(opt);
    });
    clsSel.value = currentClass;

    // Year
    const yrSel = $('report-year');
    yrSel.innerHTML = '';
    NepaliCalendar.getAvailableYears().forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y} BS`;
      yrSel.appendChild(opt);
    });
    yrSel.value = currentYear;

    // Month
    const mSel = $('report-month');
    mSel.innerHTML = '';
    NepaliCalendar.getMonths().forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i + 1;
      opt.textContent = `${m.np} (${m.en})`;
      mSel.appendChild(opt);
    });
    mSel.value = currentMonth;
  }

  function generateReport() {
    currentClass = $('report-class').value;
    currentYear  = parseInt($('report-year').value);
    currentMonth = parseInt($('report-month').value);

    const students = DB.getStudents(currentClass);
    const monthData = DB.getMonthlyAttendance(currentClass, currentYear, currentMonth);
    const daysInMonth = NepaliCalendar.daysInBSMonth(currentYear, currentMonth);
    const months = NepaliCalendar.getMonths();

    // Build day list
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }

    // Map date → records
    const dateMap = {};
    monthData.forEach(entry => {
      const day = parseInt(entry.date.split('-')[2]);
      dateMap[day] = entry.records || {};
    });

    // School working days (days with attendance data)
    const workingDays = days.filter(d => dateMap[d] !== undefined);

    // Alert helpers
    const lowAttStudents = [];

    // Build table
    const tableEl = $('report-table-container');

    if (students.length === 0) {
      tableEl.innerHTML = `<div class="no-students-msg"><div class="empty-icon">📊</div>
        <h3>यस कक्षामा कुनै विद्यार्थी छैन</h3>
        <p>Add students to generate reports.</p></div>`;
      return;
    }

    // Header row
    const th = `
      <thead>
        <tr>
          <th style="width:36px">#</th>
          <th class="name-col" style="min-width:160px">विद्यार्थीको नाम</th>
          <th style="width:80px">ID</th>
          ${days.map(d => `<th style="width:32px">${d}</th>`).join('')}
          <th style="width:60px">P</th>
          <th style="width:60px">A</th>
          <th style="width:60px">L</th>
          <th style="min-width:120px">उपस्थिति %</th>
        </tr>
      </thead>`;

    // Body rows
    const tbody = students.map((s, idx) => {
      let P = 0, A = 0, L = 0, HD = 0;

      const cells = days.map(d => {
        const dayRecords = dateMap[d];
        if (!dayRecords) return `<td class="day-none">—</td>`;
        const status = dayRecords[s.id] || 'P';
        if (status === 'P') P++;
        else if (status === 'A') A++;
        else if (status === 'L') { L++; P++; } // Late counts as present
        else if (status === 'HD') { HD++; }
        return `<td class="day-${status}">${ATTENDANCE_STATUS[status].icon}</td>`;
      }).join('');

      const totalWorking = workingDays.length;
      const pct = totalWorking > 0 ? Math.round((P / totalWorking) * 100) : 0;

      if (pct < 75 && totalWorking > 0) {
        lowAttStudents.push({ name: s.name, id: s.id, pct });
      }

      const pctClass = pct >= 90 ? 'good' : pct >= 75 ? 'warning' : 'danger';

      return `
        <tr>
          <td style="text-align:center;color:var(--text-muted)">${idx+1}</td>
          <td class="name-col">${s.name}${s.nameEn ? `<br><small style="color:var(--text-muted)">${s.nameEn}</small>` : ''}</td>
          <td style="font-size:0.78rem;color:var(--text-muted)">${s.id}</td>
          ${cells}
          <td style="text-align:center;color:var(--clr-present);font-weight:700">${P}</td>
          <td style="text-align:center;color:var(--clr-absent);font-weight:700">${A}</td>
          <td style="text-align:center;color:var(--clr-late);font-weight:700">${L}</td>
          <td class="pct-bar-cell">
            <div style="font-weight:700;font-size:0.88rem;color:var(--${pctClass === 'good' ? 'clr-present' : pctClass === 'warning' ? 'clr-late' : 'clr-absent'})">${pct}%</div>
            <div class="pct-bar"><div class="pct-bar-fill ${pctClass}" style="width:${pct}%"></div></div>
          </td>
        </tr>`;
    }).join('');

    tableEl.innerHTML = `
      <div style="overflow-x:auto">
        <table class="report-table">
          ${th}
          <tbody>${tbody}</tbody>
        </table>
      </div>`;

    // Low attendance alerts
    renderAlerts(lowAttStudents);
    renderSummaryStats(students, workingDays, dateMap);
  }

  function renderAlerts(lowList) {
    const el = $('low-att-alerts');
    if (lowList.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <div class="low-att-alert">
        <div class="alert-icon">⚠️</div>
        <div class="alert-text">
          <strong>${lowList.length} विद्यार्थी</strong> को उपस्थिति <strong>७५% भन्दा कम</strong> छ:<br>
          ${lowList.map(s => `<span style="margin-right:12px">📌 ${s.name} (${s.pct}%)</span>`).join(' ')}
        </div>
      </div>`;
  }

  function renderSummaryStats(students, workingDays, dateMap) {
    const el = $('report-summary-stats');
    const total = students.length;

    // Average attendance across all students all days
    let totalPresent = 0, totalAbsent = 0;
    workingDays.forEach(d => {
      const recs = dateMap[d] || {};
      students.forEach(s => {
        const st = recs[s.id] || 'P';
        if (st === 'P' || st === 'L') totalPresent++;
        else if (st === 'A') totalAbsent++;
      });
    });

    const avgPct = (workingDays.length * total) > 0
      ? Math.round((totalPresent / (workingDays.length * total)) * 100)
      : 0;

    const cls = CLASSES.find(c => c.id === currentClass);
    const months = NepaliCalendar.getMonths();

    el.innerHTML = `
      <div class="stats-grid" style="margin-bottom:0">
        <div class="stat-card clr-blue">
          <div class="stat-icon">👥</div>
          <div class="stat-value">${total}</div>
          <div class="stat-label">जम्मा विद्यार्थी</div>
        </div>
        <div class="stat-card clr-green">
          <div class="stat-icon">📅</div>
          <div class="stat-value">${workingDays.length}</div>
          <div class="stat-label">कार्य दिन (${months[currentMonth-1]?.np})</div>
        </div>
        <div class="stat-card clr-green">
          <div class="stat-icon">✅</div>
          <div class="stat-value">${avgPct}%</div>
          <div class="stat-label">औसत उपस्थिति</div>
        </div>
        <div class="stat-card clr-red">
          <div class="stat-icon">⚠️</div>
          <div class="stat-value">${$('low-att-alerts').querySelector('.alert-text strong')?.textContent.split(' ')[0] || 0}</div>
          <div class="stat-label">न्यून उपस्थिति</div>
        </div>
      </div>`;
  }

  function exportReport() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library loading...', 'info', '⏳');
      return;
    }

    const students  = DB.getStudents(currentClass);
    const monthData = DB.getMonthlyAttendance(currentClass, currentYear, currentMonth);
    const months    = NepaliCalendar.getMonths();

    const dateMap = {};
    monthData.forEach(entry => {
      const day = parseInt(entry.date.split('-')[2]);
      dateMap[day] = entry.records || {};
    });

    const daysInMonth = NepaliCalendar.daysInBSMonth(currentYear, currentMonth);
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    const workingDays = days.filter(d => dateMap[d]);

    const rows = students.map((s, idx) => {
      let P = 0, A = 0, L = 0;
      const row = {
        'Roll No': idx + 1,
        'Student ID': s.id,
        'Name': s.name,
        'Name (EN)': s.nameEn || '',
        'Gender': s.gender || '',
      };
      days.forEach(d => {
        const st = (dateMap[d] || {})[s.id];
        row[`Day ${d}`] = st ? ATTENDANCE_STATUS[st].icon : '—';
        if (st === 'P' || st === 'L') P++;
        else if (st === 'A') A++;
        else if (st === undefined && dateMap[d]) P++;
      });
      const pct = workingDays.length > 0 ? Math.round((P/workingDays.length)*100) : 0;
      row['Present'] = P;
      row['Absent']  = A;
      row['Late']    = L;
      row['Attendance %'] = pct + '%';
      return row;
    });

    const cls = CLASSES.find(c => c.id === currentClass);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `Report_${cls?.label}_${currentYear}_${months[currentMonth-1]?.en}.xlsx`);
    showToast('Report exported!', 'success', '📥');
  }

  return { init, generateReport };
})();

