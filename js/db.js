/**
 * Data Store — localStorage-based persistence layer
 */
const DB = (() => {
  const KEYS = {
    SCHOOL: 'nmv_school',
    TEACHERS: 'nmv_teachers',
    STUDENTS: 'nmv_students',
    ATTENDANCE: 'nmv_attendance',
    SETTINGS: 'nmv_settings',
    ACTIVE_TEACHER: 'nmv_active_teacher',
    USERS: 'nmv_users',
    ACTIVE_USER: 'nmv_active_user',
  };

  function get(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  }

  function set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    
    // Auto-sync to Firebase cloud if configured
    if (window.FirestoreDB && window.FirestoreFns) {
      try {
        const { doc, setDoc } = window.FirestoreFns;
        const docRef = doc(window.FirestoreDB, "nepalmavi-db", key);
        setDoc(docRef, { 
          payload: JSON.stringify(value), 
          updatedAt: new Date().toISOString() 
        }).catch(() => { /* Firebase handles offline queuing implicitly */ });
      } catch (e) {}
    }
  }

  // Explicitly fetch and overwrite local data with cloud data
  async function syncFromCloud() {
    if (!window.FirestoreDB || !window.FirestoreFns) return 0;
    try {
      const { collection, getDocs } = window.FirestoreFns;
      const colRef = collection(window.FirestoreDB, "nepalmavi-db");
      const snap = await getDocs(colRef);
      let keysUpdated = 0;
      snap.forEach(docSnap => {
        const key = docSnap.id;
        const data = docSnap.data();
        if (data && data.payload) {
          // Write directly to localstorage to avoid triggering recursive set() upload
          localStorage.setItem(key, data.payload);
          keysUpdated++;
        }
      });
      return keysUpdated;
    } catch (e) {
      console.error('Cloud Sync Error: ', e);
      return -1;
    }
  }

  // ── School ──────────────────────────────────────────────
  function getSchool() {
    return get(KEYS.SCHOOL) || {
      name: 'सरकारी विद्यालय',
      nameEn: 'Government School',
      address: '',
      district: '',
      emis_code: '',
      principal: '',
    };
  }
  function saveSchool(data) { set(KEYS.SCHOOL, data); }

  // ── Teachers ────────────────────────────────────────────
  function getTeachers() {
    return get(KEYS.TEACHERS) || [
      { id: 't1', name: 'प्रधानाध्यापक', nameEn: 'Principal', assignedClasses: [] },
    ];
  }
  function saveTeachers(data) { set(KEYS.TEACHERS, data); }
  function addTeacher(t) {
    const list = getTeachers();
    list.push({ ...t, id: 't' + Date.now() });
    saveTeachers(list);
  }
  function getActiveTeacher() {
    const id = localStorage.getItem(KEYS.ACTIVE_TEACHER);
    if (!id) return null;
    return getTeachers().find(t => t.id === id) || null;
  }
  function setActiveTeacher(id) {
    localStorage.setItem(KEYS.ACTIVE_TEACHER, id);
  }

  // ── User accounts (auth) ────────────────────────────────────────────────────
  const DEFAULT_USERS = [
    { id: 'admin',   name: 'Administrator', nameEn: 'Administrator',    role: 'admin',   classId: null,      password: 'admin123'    },
    { id: 'ECD',     name: 'teacher_ECD/PPC', nameEn: 'Teacher ECD/PPC', role: 'teacher', classId: 'ECD',     password: 'passwordECD' },
    { id: 'class1',  name: 'teacher_Class 1',  nameEn: 'Teacher Class 1',  role: 'teacher', classId: 'class1',  password: 'password1'   },
    { id: 'class2',  name: 'teacher_Class 2',  nameEn: 'Teacher Class 2',  role: 'teacher', classId: 'class2',  password: 'password2'   },
    { id: 'class3',  name: 'teacher_Class 3',  nameEn: 'Teacher Class 3',  role: 'teacher', classId: 'class3',  password: 'password3'   },
    { id: 'class4',  name: 'teacher_Class 4',  nameEn: 'Teacher Class 4',  role: 'teacher', classId: 'class4',  password: 'password4'   },
    { id: 'class5',  name: 'teacher_Class 5',  nameEn: 'Teacher Class 5',  role: 'teacher', classId: 'class5',  password: 'password5'   },
    { id: 'class6',  name: 'teacher_Class 6',  nameEn: 'Teacher Class 6',  role: 'teacher', classId: 'class6',  password: 'password6'   },
    { id: 'class7',  name: 'teacher_Class 7',  nameEn: 'Teacher Class 7',  role: 'teacher', classId: 'class7',  password: 'password7'   },
    { id: 'class8',  name: 'teacher_Class 8',  nameEn: 'Teacher Class 8',  role: 'teacher', classId: 'class8',  password: 'password8'   },
    { id: 'class9',  name: 'teacher_Class 9',  nameEn: 'Teacher Class 9',  role: 'teacher', classId: 'class9',  password: 'password9'   },
    { id: 'class10', name: 'teacher_Class 10', nameEn: 'Teacher Class 10', role: 'teacher', classId: 'class10', password: 'password10'  },
    { id: 'class11', name: 'teacher_Class 11', nameEn: 'Teacher Class 11', role: 'teacher', classId: 'class11', password: 'password11'  },
    { id: 'class12', name: 'teacher_Class 12', nameEn: 'Teacher Class 12', role: 'teacher', classId: 'class12', password: 'password12'  },
  ];

  function getUsers() { return get(KEYS.USERS) || DEFAULT_USERS; }
  function saveUsers(list) { set(KEYS.USERS, list); }
  function getUser(id) { return getUsers().find(function(u) { return u.id === id; }) || null; }

  function verifyLogin(id, password) {
    var u = getUser(id);
    return (u && u.password === password) ? u : null;
  }

  function updatePassword(userId, newPassword) {
    var users = getUsers();
    var idx = users.findIndex(function(u) { return u.id === userId; });
    if (idx !== -1) { users[idx].password = newPassword; saveUsers(users); return true; }
    return false;
  }

  function getActiveUser() {
    var id = localStorage.getItem(KEYS.ACTIVE_USER);
    return id ? getUser(id) : null;
  }
  function setActiveUser(id) { localStorage.setItem(KEYS.ACTIVE_USER, id); }
  function clearActiveUser() { localStorage.removeItem(KEYS.ACTIVE_USER); }

  // ── Students ────────────────────────────────────────────
  function getStudents(classId) {
    const all = get(KEYS.STUDENTS) || {};
    if (classId) return (all[classId] || []).sort((a, b) => a.name.localeCompare(b.name, 'ne'));
    return all;
  }
  function saveStudentsForClass(classId, list) {
    const all = get(KEYS.STUDENTS) || {};
    all[classId] = list.sort((a, b) => a.name.localeCompare(b.name, 'ne'));
    set(KEYS.STUDENTS, all);
  }
  function addStudent(classId, student) {
    const list = getStudents(classId);
    student.id = student.id || 'S' + Date.now();
    list.push(student);
    saveStudentsForClass(classId, list);
    return student;
  }
  function updateStudent(classId, studentId, updates) {
    const list = getStudents(classId);
    const idx = list.findIndex(s => s.id === studentId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates };
      saveStudentsForClass(classId, list);
    }
  }
  function deleteStudent(classId, studentId) {
    const list = getStudents(classId).filter(s => s.id !== studentId);
    saveStudentsForClass(classId, list);
  }
  function importStudents(classId, students) {
    const existing = getStudents(classId);
    const existingNames = new Set(existing.map(s => s.name.trim().toLowerCase()));
    const newOnes = students.filter(s => s.name && !existingNames.has(s.name.trim().toLowerCase()));
    const merged = [...existing, ...newOnes];
    saveStudentsForClass(classId, merged);
    return newOnes.length;
  }
  function clearAllStudents() {
    set(KEYS.STUDENTS, {});
  }

  // ── Attendance ──────────────────────────────────────────
  // Key pattern: classId + ':' + 'YYYY-MM-DD'
  function getAttendance(classId, bsDate) {
    const all = get(KEYS.ATTENDANCE) || {};
    const key = `${classId}:${bsDate}`;
    return all[key] || null;
  }
  function saveAttendance(classId, bsDate, records) {
    const all = get(KEYS.ATTENDANCE) || {};
    all[`${classId}:${bsDate}`] = {
      classId,
      date: bsDate,
      records, // { studentId: 'P'|'A'|'L'|'HD' }
      savedAt: new Date().toISOString(),
    };
    set(KEYS.ATTENDANCE, all);
  }
  function getMonthlyAttendance(classId, bsYear, bsMonth) {
    const all = get(KEYS.ATTENDANCE) || {};
    const prefix = `${classId}:${bsYear}-${String(bsMonth).padStart(2, '0')}`;
    return Object.entries(all)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);
  }
  function getAllAttendanceForClass(classId) {
    const all = get(KEYS.ATTENDANCE) || {};
    return Object.entries(all)
      .filter(([k]) => k.startsWith(classId + ':'))
      .map(([, v]) => v);
  }

  // ── Settings ────────────────────────────────────────────
  function getSettings() {
    return get(KEYS.SETTINGS) || {
      academicYear: 2083,
      theme: 'dark',
      language: 'np',
      workingDays: [0, 1, 2, 3, 4], // Sun–Thu (Nepal gov school)
      showRollNumber: true,
    };
  }
  function saveSettings(data) { set(KEYS.SETTINGS, { ...getSettings(), ...data }); }

  // ── Export All ──────────────────────────────────────────
  function exportAll() {
    return {
      school: getSchool(),
      teachers: getTeachers(),
      students: get(KEYS.STUDENTS) || {},
      attendance: get(KEYS.ATTENDANCE) || {},
      settings: getSettings(),
      exportedAt: new Date().toISOString(),
    };
  }
  function importAll(data) {
    if (data.school) saveSchool(data.school);
    if (data.teachers) saveTeachers(data.teachers);
    if (data.students) set(KEYS.STUDENTS, data.students);
    if (data.attendance) set(KEYS.ATTENDANCE, data.attendance);
    if (data.settings) set(KEYS.SETTINGS, data.settings);
  }

  return {
    getSchool, saveSchool,
    getTeachers, saveTeachers, addTeacher, getActiveTeacher, setActiveTeacher,
    getUsers, saveUsers, getUser, verifyLogin, updatePassword,
    getActiveUser, setActiveUser, clearActiveUser,
    getStudents, saveStudentsForClass, addStudent, updateStudent, deleteStudent,
    importStudents, clearAllStudents,
    getAttendance, saveAttendance, getMonthlyAttendance, getAllAttendanceForClass,
    getSettings, saveSettings,
    exportAll, importAll,
    syncFromCloud,
  };
})();

// ── Class definitions ────────────────────────────────────────────────────────
const CLASSES = [
  { id: 'ECD', label: 'ECD/PPC', labelNp: 'ईसीडी/पीपीसी', level: 0 },
  { id: 'class1', label: 'Class 1', labelNp: 'कक्षा १', level: 1 },
  { id: 'class2', label: 'Class 2', labelNp: 'कक्षा २', level: 2 },
  { id: 'class3', label: 'Class 3', labelNp: 'कक्षा ३', level: 3 },
  { id: 'class4', label: 'Class 4', labelNp: 'कक्षा ४', level: 4 },
  { id: 'class5', label: 'Class 5', labelNp: 'कक्षा ५', level: 5 },
  { id: 'class6', label: 'Class 6', labelNp: 'कक्षा ६', level: 6 },
  { id: 'class7', label: 'Class 7', labelNp: 'कक्षा ७', level: 7 },
  { id: 'class8', label: 'Class 8', labelNp: 'कक्षा ८', level: 8 },
  { id: 'class9', label: 'Class 9', labelNp: 'कक्षा ९', level: 9 },
  { id: 'class10', label: 'Class 10', labelNp: 'कक्षा १०', level: 10 },
  { id: 'class11', label: 'Class 11', labelNp: 'कक्षा ११', level: 11 },
  { id: 'class12', label: 'Class 12', labelNp: 'कक्षा १२', level: 12 },
];

const ATTENDANCE_STATUS = {
  P: { label: 'उपस्थित', labelEn: 'Present', icon: '✓', class: 'present' },
  A: { label: 'अनुपस्थित', labelEn: 'Absent', icon: '✗', class: 'absent' },
};

// Nepali numeral converter
function toNepaliNumerals(n) {
  return String(n).replace(/\d/g, d => '०१२३४५६७८९'[d]);
}


