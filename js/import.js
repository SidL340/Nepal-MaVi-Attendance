/**
 * Excel Import Module (EMIS / manual upload)
 * Uses SheetJS (XLSX) loaded from CDN
 * Features: visual column mapper, fuzzy matching, raw row preview
 */
const ImportPage = (() => {

  let rawRows     = [];   // original Excel rows as objects
  let excelCols   = [];   // column headers from the file
  let parsedData  = [];   // final mapped student array
  let targetClass = CLASSES[0].id;

  const $ = id => document.getElementById(id);

  // ── Fields we want to map ──────────────────────────────────────────────────
  const FIELD_DEFS = [
    { key: 'name',    label: 'विद्यार्थीको नाम *',  labelEn: 'Student Name (required)', required: true },
    { key: 'id',      label: 'विद्यार्थी ID',         labelEn: 'Student ID',              required: false },
    { key: 'nameEn',  label: 'नाम (अंग्रेजी)',        labelEn: 'Name in English',         required: false },
    { key: 'gender',  label: 'लिङ्ग',                 labelEn: 'Gender',                  required: false },
    { key: 'dob',     label: 'जन्म मिति',             labelEn: 'Date of Birth',           required: false },
    { key: 'contact', label: 'सम्पर्क',               labelEn: 'Contact / Phone',         required: false },
    { key: 'classRaw',label: 'कक्षा',                 labelEn: 'Class',                   required: false },
  ];

  // Fuzzy column auto-detection hints
  const AUTO_HINTS = {
    name:     ['student name','student_name','name','नाम','विद्यार्थीको नाम','full name','fullname','student'],
    id:       ['student id','student_id','id','emis id','emis_id','roll no','roll_no','रोल नं','id no','suid','uid'],
    nameEn:   ['name (english)','name english','english name','name_en','name_english','english'],
    gender:   ['gender','लिङ्ग','sex','लिंग'],
    dob:      ['date of birth','dob','जन्म मिति','birth date','dob (bs)','date_of_birth','born'],
    contact:  ['contact','phone','guardian','mobile','phone no','contact no','सम्पर्क'],
    classRaw: ['class','कक्षा','grade','class name','section','शाखा'],
  };

  function init() {
    buildClassSelector();
    setupDropZone();
    $('import-file-input')?.addEventListener('change', onFileSelected);
    $('download-template-btn')?.addEventListener('click', downloadTemplate);
    $('import-class-select')?.addEventListener('change', () => {
      targetClass = $('import-class-select').value;
    });
    $('export-all-btn')?.addEventListener('click', exportAllData);
    $('import-backup-btn')?.addEventListener('click', () => $('backup-file-input')?.click());
    $('backup-file-input')?.addEventListener('change', importBackup);
  }

  function buildClassSelector() {
    const sel = $('import-class-select');
    if (!sel) return;
    sel.innerHTML = '';

    // Add explicit "All Classes" option for administrators
    if (window.currentUser && window.currentUser.role === 'admin') {
      const optAll = document.createElement('option');
      optAll.value = 'ALL';
      optAll.textContent = '📚 सबै कक्षा (Upload to All Classes)';
      sel.appendChild(optAll);
    }

    CLASSES.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls.id;
      opt.textContent = `${cls.labelNp} (${cls.label})`;
      sel.appendChild(opt);
    });
    
    // Attempt to keep previous selection, otherwise default to ALL if admin, or first class
    if (window.currentUser && window.currentUser.role === 'admin' && !targetClass) {
      sel.value = 'ALL';
      targetClass = 'ALL';
    } else {
      sel.value = targetClass;
    }

    // Lock class teacher to their class
    if (window.currentUser && window.currentUser.role === 'teacher') {
      sel.value    = window.currentUser.classId;
      sel.disabled = true;
      targetClass  = window.currentUser.classId;
    }
  }

  // ── Drop zone ─────────────────────────────────────────────────────────────
  function setupDropZone() {
    const dz = $('drop-zone');
    dz.addEventListener('click', () => $('import-file-input').click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    });
  }

  function onFileSelected(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  // ── Read file ─────────────────────────────────────────────────────────────
  function processFile(file) {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded. Please check internet connection.', 'error', '❌');
      return;
    }

    showToast('फाइल पढिँदैछ...', 'info', '⏳', 2000);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        // Use arraybuffer for better compatibility
        const data = new Uint8Array(evt.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];

        // raw_header:true + defval:'' gives us every column
        const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

        if (json.length === 0) {
          showToast('Excel file is empty or could not be read.', 'error', '❌');
          return;
        }

        rawRows   = json;
        excelCols = Object.keys(json[0]);

        showColumnMapper();
      } catch (err) {
        showToast('Failed to read file: ' + err.message, 'error', '❌');
        console.error('Import error:', err);
      }
    };
    reader.onerror = () => showToast('Could not read file. Please try again.', 'error', '❌');
    reader.readAsArrayBuffer(file);  // ← ArrayBuffer, not BinaryString
  }

  // ── Column Mapper UI ──────────────────────────────────────────────────────
  function showColumnMapper() {
    const section = $('import-preview-section');
    section.classList.remove('hidden');

    // Auto-detect columns
    const autoMap = autoDetectColumns(excelCols);

    // Build mapper HTML
    const mapperRows = FIELD_DEFS.map(fd => {
      const options = excelCols.map(col =>
        `<option value="${col}" ${autoMap[fd.key] === col ? 'selected' : ''}>${col}</option>`
      ).join('');

      return `
        <tr>
          <td style="padding:10px 14px;font-weight:600;font-size:0.9rem">
            ${fd.label}
            ${fd.required ? '<span style="color:var(--clr-absent)"> *</span>' : ''}
            <br><small style="color:var(--text-muted);font-weight:400">${fd.labelEn}</small>
          </td>
          <td style="padding:10px 14px">
            <select id="col-map-${fd.key}" style="width:100%;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);font-size:0.9rem">
              <option value="">— छान्नुहोस् / Select column —</option>
              ${options}
            </select>
          </td>
          <td style="padding:10px 14px;font-size:0.8rem;color:var(--text-muted)">
            ${autoMap[fd.key] ? `✅ Auto-detected: <strong style="color:var(--clr-present)">"${autoMap[fd.key]}"</strong>` : '—'}
          </td>
        </tr>`;
    }).join('');

    // Show first 3 rows as sample
    const sampleRows = rawRows.slice(0, 3).map(row =>
      `<tr>${excelCols.map(col =>
        `<td style="padding:5px 10px;font-size:0.8rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${row[col] || '—'}</td>`
      ).join('')}</tr>`
    ).join('');

    section.innerHTML = `
      <!-- File info banner -->
      <div style="background:rgba(39,174,96,0.1);border:1px solid rgba(39,174,96,0.25);border-radius:var(--radius-md);padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px">
        <span style="font-size:1.6rem">📊</span>
        <div>
          <strong style="color:var(--clr-present)">${rawRows.length} rows</strong> पाइयो Excel मा &nbsp;|&nbsp;
          <strong>${excelCols.length} columns</strong> फेला पर्यो
          <br><span style="font-size:0.82rem;color:var(--text-muted)">तलका स्तम्भहरू मिलाउनुहोस् र आयात गर्नुहोस्।  Map the columns below then click Import.</span>
        </div>
      </div>

      <!-- Sample data preview -->
      <details style="margin-bottom:16px">
        <summary style="cursor:pointer;font-size:0.88rem;font-weight:600;color:var(--text-secondary);padding:8px 0">
          👁 Excel फाइलका पहिलो ३ लाइन हेर्नुहोस् (Preview first 3 rows)
        </summary>
        <div style="overflow-x:auto;margin-top:10px;border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
            <thead>
              <tr style="background:rgba(192,57,43,0.08)">
                ${excelCols.map(c => `<th style="padding:7px 10px;text-align:left;color:var(--text-muted);white-space:nowrap">${c}</th>`).join('')}
              </tr>
            </thead>
            <tbody>${sampleRows}</tbody>
          </table>
        </div>
      </details>

      <!-- Column mapper -->
      <div style="font-size:0.9rem;font-weight:700;margin-bottom:12px;color:var(--text-primary)">
        🔗 स्तम्भ जोड्नुहोस् — Map Excel Columns to Fields
      </div>
      <div style="background:var(--bg-raised);border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;margin-bottom:18px">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:rgba(192,57,43,0.08)">
              <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-size:0.78rem;text-transform:uppercase">फिल्ड / Field</th>
              <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-size:0.78rem;text-transform:uppercase">Excel स्तम्भ / Column</th>
              <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-size:0.78rem;text-transform:uppercase">स्वतः पहिचान / Auto-detected</th>
            </tr>
          </thead>
          <tbody>${mapperRows}</tbody>
        </table>
      </div>

      <!-- Import mode toggle -->
      <div style="background:rgba(192,57,43,0.06);border:1px solid rgba(192,57,43,0.2);border-radius:var(--radius-md);padding:14px 18px;margin-bottom:16px">
        <label style="display:flex;align-items:center;gap:12px;cursor:pointer;font-size:0.92rem;font-weight:600">
          <input type="checkbox" id="import-all-classes-toggle" style="width:18px;height:18px;accent-color:var(--brand-red);cursor:pointer" ${$('import-class-select').value === 'ALL' ? 'checked' : ''}>
          <span>📚 सबै कक्षामा आयात गर्नुहोस् — <strong>Upload to All Classes</strong></span>
        </label>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:6px;margin-left:30px">
          Excel को <strong>Class/कक्षा</strong> स्तम्भ अनुसार विद्यार्थीलाई स्वतः कक्षामा राखिनेछ।<br>
          Students will be automatically placed in their class using the Class column.
          <br><small>Tip: Map the "कक्षा / Class" column below for this to work.</small>
        </div>
      </div>

      <!-- Clear all students button -->
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button onclick="ImportPage.clearAllAndReset()" class="btn btn-danger btn-sm" style="gap:8px">
          🗑 सबै विद्यार्थी मेट्नुहोस् — Clear All Students
        </button>
      </div>

      <!-- Column mapper -->
      <div style="font-size:0.9rem;font-weight:700;margin-bottom:12px;color:var(--text-primary)">
        🔗 स्तम्भ जोड्नुहोस् — Map Excel Columns to Fields
      </div>

      <!-- Action buttons -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button onclick="ImportPage.previewMapped()" class="btn btn-ghost">
          👁 Preview Mapping
        </button>
        <button id="confirm-import-btn" class="btn btn-primary">
          ✅ आयात पुष्टि गर्नुहोस् — Confirm Import
        </button>
        <button id="cancel-import-preview-btn" class="btn btn-ghost" style="margin-left:auto">
          ✕ रद्द / Cancel
        </button>
      </div>




      <!-- Mapped preview table (shown after Preview click) -->
      <div id="mapped-preview-area" style="margin-top:18px"></div>

      <div id="import-success-summary" class="hidden" style="margin-top:14px"></div>`;

    // Re-attach listeners since innerHTML replaced them
    $('confirm-import-btn').addEventListener('click', confirmImport);
    $('cancel-import-preview-btn').addEventListener('click', resetImport);
  }

  // ── Auto-detect column mapping ────────────────────────────────────────────
  function autoDetectColumns(cols) {
    const result = {};
    const lowerCols = cols.map(c => c.toLowerCase().trim());

    for (const [field, hints] of Object.entries(AUTO_HINTS)) {
      for (const hint of hints) {
        const idx = lowerCols.findIndex(c => c.includes(hint) || hint.includes(c));
        if (idx !== -1 && !Object.values(result).includes(cols[idx])) {
          result[field] = cols[idx];
          break;
        }
      }
    }
    return result;
  }

  // ── Read current column mapping from dropdowns ────────────────────────────
  function getCurrentMapping() {
    const map = {};
    FIELD_DEFS.forEach(fd => {
      const sel = $(`col-map-${fd.key}`);
      if (sel && sel.value) map[fd.key] = sel.value;
    });
    return map;
  }

  // ── Apply mapping to raw rows → student objects ───────────────────────────
  function applyMapping(rows, colMap) {
    return rows.map((row, i) => {
      const get = (field) => {
        const col = colMap[field];
        return col ? String(row[col] || '').trim() : '';
      };

      const name    = get('name');
      const id      = get('id') || ('STU' + (Date.now() + i).toString().slice(-6));
      const nameEn  = get('nameEn');
      const gender  = mapGender(get('gender'));
      const dob     = get('dob');
      const contact = get('contact');
      const classRaw= get('classRaw');

      return { id, name, nameEn, gender, dob, contact, classRaw, addedAt: new Date().toISOString() };
    }).filter(s => s.name); // Only keep rows where name was found
  }

  // ── Preview mapped data ───────────────────────────────────────────────────
  function previewMapped() {
    const colMap  = getCurrentMapping();
    const mapped  = applyMapping(rawRows, colMap);
    const preview = $('mapped-preview-area');

    if (!colMap.name) {
      preview.innerHTML = `<div style="color:var(--clr-absent);padding:12px;border-radius:var(--radius-md);background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.3)">
        ❌ कृपया विद्यार्थीको नाम स्तम्भ छान्नुहोस्। Please select the Student Name column.
      </div>`;
      return;
    }

    if (mapped.length === 0) {
      preview.innerHTML = `<div style="color:var(--clr-absent);padding:12px;border-radius:var(--radius-md);background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.3)">
        ❌ छानिएको स्तम्भमा कुनै नाम भेटिएन। No student names found in selected column. Please check the column mapping.
      </div>`;
      return;
    }

    parsedData = mapped; // update for confirm

    const tableRows = mapped.slice(0, 15).map((s, i) => `
      <tr>
        <td style="padding:7px 10px;text-align:center;color:var(--text-muted)">${i+1}</td>
        <td style="padding:7px 10px;font-weight:600">${s.name}</td>
        <td style="padding:7px 10px;font-size:0.85rem;color:var(--text-muted)">${s.nameEn || '—'}</td>
        <td style="padding:7px 10px;font-family:monospace;font-size:0.82rem">${s.id}</td>
        <td style="padding:7px 10px">
          <span class="gender-badge ${s.gender}">${s.gender === 'male' ? '👦' : s.gender === 'female' ? '👧' : '🧑'} ${s.gender}</span>
        </td>
        <td style="padding:7px 10px;font-size:0.82rem">${s.dob || '—'}</td>
      </tr>`).join('');

    preview.innerHTML = `
      <div style="background:rgba(39,174,96,0.08);border:1px solid rgba(39,174,96,0.2);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:12px">
        ✅ <strong style="color:var(--clr-present)">${mapped.length} विद्यार्थी</strong> Import गर्न तयार छन्।
        ${rawRows.length - mapped.length > 0 ? `<span style="color:var(--clr-late)"> &nbsp;(${rawRows.length - mapped.length} rows skipped — empty name)</span>` : ''}
      </div>
      <div style="overflow-x:auto;border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
        <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
          <thead><tr style="background:rgba(192,57,43,0.08)">
            <th style="padding:8px 10px;color:var(--text-muted)">#</th>
            <th style="padding:8px 10px;text-align:left;color:var(--text-muted)">नाम</th>
            <th style="padding:8px 10px;text-align:left;color:var(--text-muted)">Name (EN)</th>
            <th style="padding:8px 10px;text-align:left;color:var(--text-muted)">ID</th>
            <th style="padding:8px 10px;text-align:left;color:var(--text-muted)">लिङ्ग</th>
            <th style="padding:8px 10px;text-align:left;color:var(--text-muted)">DOB</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        ${mapped.length > 15 ? `<div style="text-align:center;padding:10px;color:var(--text-muted);font-size:0.85rem">+ ${mapped.length - 15} more students...</div>` : ''}
      </div>`;
  }

  // ── Map class text to CLASSES id ──────────────────────────────────────────
  function classNameToId(raw) {
    if (!raw) return null;
    const r = String(raw).toLowerCase().trim()
      .replace(/[\u0966-\u096f]/g, d => '0123456789'['\u0966\u0967\u0968\u0969\u096a\u096b\u096c\u096d\u096e\u096f'.indexOf(d)])
      .replace(/class|grade|\u0915\u0915\u094d\u0937\u093e|\u0915\u0947\u091c\u0940|kg|\u0908\u0938\u0940\u0921\u0940|ecd/gi, '')
      .trim();
    // ECD/PPC special
    if (/ecd|ppc|\u0908\u0938\u0940\u0921\u0940|\u092a\u0940\u092a\u0940\u0938\u0940/i.test(String(raw))) return 'ECD';
    // Numeric class
    const num = parseInt(r);
    if (num >= 1 && num <= 12) return `class${num}`;
    return null;
  }

  // ── Confirm import ─────────────────────────────────────────────────────────
  function confirmImport() {
    const colMap = getCurrentMapping();
    const allClassesMode = $('import-all-classes-toggle')?.checked;

    if (!colMap.name) {
      showToast('कृपया विद्यार्थीको नाम स्तम्भ छान्नुहोस्! Please select the Name column first.', 'error', '❌');
      return;
    }
    if (allClassesMode && !colMap.classRaw) {
      showToast('"सबै कक्षा" मोडमा कक्षा स्तम्भ पनि छान्नुहोस्। Please map the Class column too.', 'error', '❌');
      return;
    }

    parsedData = applyMapping(rawRows, colMap);
    if (parsedData.length === 0) {
      showToast('कुनै विद्यार्थी भेटिएन। नाम स्तम्भ जाँच गर्नुहोस्।', 'error', '❌');
      return;
    }

    let totalAdded = 0;
    let unmatched  = 0;

    if (allClassesMode) {
      // Group by class and import into each
      const byClass = {};
      parsedData.forEach(s => {
        const clsId = classNameToId(s.classRaw) || $('import-class-select').value;
        if (!byClass[clsId]) byClass[clsId] = [];
        byClass[clsId].push({ ...s, classId: clsId });
      });
      Object.entries(byClass).forEach(([clsId, students]) => {
        totalAdded += DB.importStudents(clsId, students);
      });
      unmatched = parsedData.filter(s => !classNameToId(s.classRaw)).length;

      const classCount = Object.keys(byClass).length;
      showToast(`🎉 ${totalAdded} विद्यार्थी ${classCount} कक्षामा थपियो!`, 'success', '✅');
    } else {
      targetClass = $('import-class-select').value;
      const toImport = parsedData.map(s => ({ ...s, classId: targetClass }));
      totalAdded = DB.importStudents(targetClass, toImport);
      showToast(`🎉 ${totalAdded} विद्यार्थी सफलतापूर्वक थपियो!`, 'success', '✅');
    }

    const summaryEl = $('import-success-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="import-summary">
          <strong>✅ Import सफल भयो!</strong><br>
          <strong>${totalAdded}</strong> नयाँ विद्यार्थी थपियो।
          ${unmatched > 0 ? `<br><span style="color:var(--clr-late)">${unmatched} students placed in default class (class column not recognized).</span>` : ''}
          ${parsedData.length - totalAdded > 0 ? `<br><span style="color:var(--text-muted)">${parsedData.length - totalAdded} duplicates skipped.</span>` : ''}
        </div>`;
      summaryEl.classList.remove('hidden');
    }

    StudentsPage.loadStudents();
    resetImport();
  }

  function clearAllAndReset() {
    if (!confirm('⚠️ यसले सबै कक्षाका सबै विद्यार्थीको डेटा मेटिनेछ!\nThis will delete ALL students from ALL classes. Continue?')) return;
    DB.clearAllStudents();
    StudentsPage.loadStudents();
    showToast('सबै विद्यार्थी मेटियो। अब नयाँ Excel आयात गर्नुहोस्।', 'success', '🗑️');
  }

  function resetImport() {
    rawRows    = [];
    excelCols  = [];
    parsedData = [];
    const section = $('import-preview-section');
    if (section) {
      section.classList.add('hidden');
      section.innerHTML = '';
    }
    $('import-file-input').value = '';
  }

  function mapGender(raw) {
    const r = (raw || '').toLowerCase().trim();
    if (['male','पुरुष','m','छात्र','boy','1'].includes(r)) return 'male';
    if (['female','महिला','f','छात्रा','girl','2'].includes(r)) return 'female';
    return 'other';
  }

  // ── Template download ──────────────────────────────────────────────────────
  function downloadTemplate() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded. Check internet.', 'error', '❌');
      return;
    }
    const template = [
      { 'Student Name': 'राम प्रसाद शर्मा', 'Student ID': 'STU001', 'Name (English)': 'Ram Prasad Sharma', 'Gender': 'Male',   'Date of Birth': '2070-04-15', 'Class': 'Class 1', 'Contact': '9841000000' },
      { 'Student Name': 'सीता देवी पौडेल',  'Student ID': 'STU002', 'Name (English)': 'Sita Devi Paudel',  'Gender': 'Female', 'Date of Birth': '2070-06-20', 'Class': 'Class 1', 'Contact': '9842000000' },
      { 'Student Name': 'कृष्ण बहादुर थापा', 'Student ID': 'STU003', 'Name (English)': 'Krishna Bahadur Thapa', 'Gender': 'Male', 'Date of Birth': '2070-08-10', 'Class': 'Class 1', 'Contact': '9843000000' },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'EMIS_Student_Template.xlsx');
    showToast('Template downloaded!', 'success', '📥');
  }

  // ── Backup / Restore ───────────────────────────────────────────────────────
  function exportAllData() {
    const data = DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `NepalMaVi_Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup saved!', 'success', '💾');
  }

  function importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!confirm('This will OVERWRITE all current data. Proceed?')) return;
        DB.importAll(data);
        showToast('Backup restored! Reloading...', 'success', '✅');
        setTimeout(() => location.reload(), 1500);
      } catch {
        showToast('Invalid backup file.', 'error', '❌');
      }
    };
    reader.readAsText(file);
  }

  return { init, previewMapped, clearAllAndReset, buildClassSelector };
})();


