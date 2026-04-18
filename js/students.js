/**
 * Students Management Module
 */
const StudentsPage = (() => {

  let currentClass = CLASSES[0].id;
  let allStudents  = [];
  let editingId    = null;

  const $ = id => document.getElementById(id);

  function init() {
    buildClassFilter();
    $('students-class-filter').addEventListener('change', () => {
      currentClass = $('students-class-filter').value;
      loadStudents();
    });
    $('add-student-btn').addEventListener('click', () => openAddModal());
    $('students-search').addEventListener('input', renderTable);
    $('student-form').addEventListener('submit', onStudentFormSubmit);
    $('cancel-student-btn').addEventListener('click', closeModal);
    $('import-excel-btn').addEventListener('click', () => {
      navigateTo('import');
    });

    loadStudents();
  }

  function buildClassFilter() {
    const sel = $('students-class-filter');
    sel.innerHTML = '';
    CLASSES.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls.id;
      opt.textContent = `${cls.labelNp} (${cls.label})`;
      sel.appendChild(opt);
    });
    sel.value = currentClass;
    // Lock class teacher to their class
    if (window.currentUser && window.currentUser.role === 'teacher') {
      sel.value    = window.currentUser.classId;
      sel.disabled = true;
      currentClass = window.currentUser.classId;
    }
  }

  function loadStudents() {
    allStudents = DB.getStudents(currentClass);
    renderTable();
    updateStudentCount();
  }

  function renderTable() {
    const tbody  = $('students-tbody');
    const query  = ($('students-search').value || '').toLowerCase();
    const filtered = allStudents.filter(s =>
      s.name.toLowerCase().includes(query) ||
      (s.id || '').toLowerCase().includes(query) ||
      (s.nameEn || '').toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:48px">
        ${allStudents.length === 0
          ? '🎒 यस कक्षामा कुनै विद्यार्थी छैनन्। Add students using the button above.'
          : '🔍 No students match your search.'}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((s, idx) => `
      <tr>
        <td style="color:var(--text-muted);text-align:center">${idx + 1}</td>
        <td><strong>${s.name}</strong>${s.nameEn ? `<br><span style="color:var(--text-muted);font-size:0.8rem">${s.nameEn}</span>` : ''}</td>
        <td style="font-family:monospace;font-size:0.88rem">${s.id}</td>
        <td>
          <span class="gender-badge ${s.gender || 'other'}">
            ${s.gender === 'male' ? '👦 छात्र' : s.gender === 'female' ? '👧 छात्रा' : '🧑 अन्य'}
          </span>
        </td>
        <td>${s.dob || '—'}</td>
        <td>${s.contact || '—'}</td>
        <td>
          <div class="flex gap-8">
            <button class="btn btn-ghost btn-sm btn-icon" title="Edit" onclick="StudentsPage.editStudent('${s.id}')">✏️</button>
            <button class="btn btn-danger btn-sm btn-icon" title="Delete" onclick="StudentsPage.deleteStudent('${s.id}')">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function updateStudentCount() {
    const el = $('student-count-badge');
    if (el) el.textContent = allStudents.length;
  }

  // ── Add/Edit Modal ────────────────────────────────────────────────────────
  function openAddModal(student = null) {
    editingId = student ? student.id : null;
    const title = $('student-modal-title');
    title.textContent = student ? 'विद्यार्थी सम्पादन गर्नुहोस्' : 'नयाँ विद्यार्थी थप्नुहोस्';

    // Populate class dropdown in modal
    const classSel = $('student-class');
    classSel.innerHTML = '';
    CLASSES.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls.id;
      opt.textContent = `${cls.labelNp} (${cls.label})`;
      classSel.appendChild(opt);
    });
    classSel.value = student?.classId || currentClass;

    // Fill form
    $('student-id-input').value     = student?.id || generateStudentId();
    $('student-name').value         = student?.name || '';
    $('student-name-en').value      = student?.nameEn || '';
    $('student-gender').value       = student?.gender || 'male';
    $('student-dob').value          = student?.dob || '';
    $('student-contact').value      = student?.contact || '';
    $('student-notes').value        = student?.notes || '';

    $('student-modal-overlay').classList.remove('hidden');
    $('student-name').focus();
  }

  function closeModal() {
    $('student-modal-overlay').classList.add('hidden');
    editingId = null;
  }

  function generateStudentId() {
    return 'STU' + Date.now().toString().slice(-6);
  }

  function onStudentFormSubmit(e) {
    e.preventDefault();
    const classId = $('student-class').value;
    const student = {
      id:       $('student-id-input').value.trim() || generateStudentId(),
      name:     $('student-name').value.trim(),
      nameEn:   $('student-name-en').value.trim(),
      gender:   $('student-gender').value,
      dob:      $('student-dob').value,
      contact:  $('student-contact').value.trim(),
      notes:    $('student-notes').value.trim(),
      classId,
      addedAt:  new Date().toISOString(),
    };

    if (!student.name) {
      showToast('विद्यार्थीको नाम आवश्यक छ।', 'error', '❌');
      return;
    }

    if (editingId) {
      DB.updateStudent(classId, editingId, student);
      showToast('विद्यार्थी सफलतापूर्वक सम्पादन गरियो।', 'success', '✅');
    } else {
      DB.addStudent(classId, student);
      showToast(`${student.name} थपियो!`, 'success', '✅');
    }

    closeModal();
    // Reload if same class
    if (classId === currentClass) { loadStudents(); }
  }

  // ── Public methods ────────────────────────────────────────────────────────
  function editStudent(id) {
    const s = allStudents.find(st => st.id === id);
    if (s) openAddModal(s);
  }

  function deleteStudent(id) {
    const s = allStudents.find(st => st.id === id);
    if (!s) return;
    if (!confirm(`"${s.name}" लाई मेटाउने? यो कार्य पूर्ववत गर्न सकिँदैन।`)) return;
    DB.deleteStudent(currentClass, id);
    showToast(`${s.name} मेटाइयो।`, 'warning', '🗑️');
    loadStudents();
  }

  function refreshCurrentClass() {
    loadStudents();
  }

  return { init, editStudent, deleteStudent, refreshCurrentClass, loadStudents };
})();

