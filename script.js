/* ═══════════════════════════════════════════════
   MedTrack — Application Script
════════════════════════════════════════════════ */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  user: null,
  medicines: [],
  appointments: [],
  contacts: [],
  takenLog: {},      // { 'YYYY-MM-DD': { medId: 'taken'|'missed' } }
  waterLog: {},      // { 'YYYY-MM-DD': count }
  stepsLog: {},      // { 'YYYY-MM-DD': count }
  moodLog: {},       // { 'YYYY-MM-DD': emoji }
  theme: 'light',
  currentSection: 'dashboard',
  editingMedId: null,
  selectedColor: '#3b82f6',
};

let WATER_GOAL = 8;
let STEPS_GOAL = 10000;
const STORAGE_PREFIX = 'medtrack_';

// ─── Storage helpers ──────────────────────────────────────────────────────────
const store = {
  get: (key) => { try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key)); } catch { return null; } },
  set: (key, val) => localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val)),
  del: (key) => localStorage.removeItem(STORAGE_PREFIX + key),
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().split('T')[0];
}
function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}
function formatDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function timeLabel(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Night';
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── Load state from localStorage ────────────────────────────────────────────
function loadState() {
  state.theme = store.get('theme') || 'light';
  state.medicines = store.get('medicines') || [];
  state.appointments = store.get('appointments') || [];
  state.contacts = store.get('contacts') || [];
  state.takenLog = store.get('takenLog') || {};
  state.waterLog = store.get('waterLog') || {};
  state.stepsLog = store.get('stepsLog') || {};
  state.moodLog = store.get('moodLog') || {};
  // Apply stored goals so WATER_GOAL / STEPS_GOAL stay consistent
  WATER_GOAL = parseInt(store.get('waterGoal'), 10) || 8;
  STEPS_GOAL = parseInt(store.get('stepsGoal'), 10) || 10000;
}

function saveKey(key) {
  store.set(key, state[key]);
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = theme === 'dark' ? '☀️' : '🌙';
  document.querySelectorAll('.theme-btn').forEach(b => b.textContent = icon);
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme(state.theme);
  saveKey('theme');
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function initAuth() {
  const saved = store.get('session');
  if (saved && saved.email) {
    state.user = saved;
    showApp();
  }

  // Tab switcher
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      document.getElementById(target + '-form').classList.add('active');
    });
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pass = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');

    if (!email || !email.includes('@')) { showAuthError(errEl, 'Please enter a valid email address.'); return; }
    if (pass.length < 6) { showAuthError(errEl, 'Password must be at least 6 characters.'); return; }

    const users = store.get('users') || [];
    const user = users.find(u => u.email === email && u.password === pass);
    if (!user) { showAuthError(errEl, 'Invalid email or password. Please sign up if you don\'t have an account.'); return; }

    errEl.classList.add('hidden');
    state.user = { name: user.name, email: user.email };
    store.set('session', state.user);
    showApp();
  });

  // Signup
  document.getElementById('signup-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim().toLowerCase();
    const pass = document.getElementById('signup-password').value;
    const errEl = document.getElementById('signup-error');

    if (!name || name.length < 2) { showAuthError(errEl, 'Please enter your full name (at least 2 characters).'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAuthError(errEl, 'Enter a valid email address.'); return; }
    if (pass.length < 6) { showAuthError(errEl, 'Password must be at least 6 characters.'); return; }

    const users = store.get('users') || [];
    if (users.find(u => u.email === email)) { showAuthError(errEl, 'An account with this email already exists. Please log in.'); return; }

    // NOTE: passwords stored locally — this is a client-side demo app without a server
    users.push({ name, email, password: pass });
    store.set('users', users);
    errEl.classList.add('hidden');
    state.user = { name, email };
    store.set('session', state.user);
    showApp();
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    store.del('session');
    state.user = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
  });
}

function showAuthError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  initAppUI();
}

// ─── App UI init ──────────────────────────────────────────────────────────────
function initAppUI() {
  // Greeting & date
  document.getElementById('greeting-time').textContent = getGreeting();
  document.getElementById('user-name-display').textContent = (state.user.name || 'there').split(' ')[0];
  document.getElementById('today-date').textContent = formatDate(today());

  renderDashboard();
  renderMedicines();
  renderSchedule();
  renderTracker();
  renderAppointments();
  renderStats();
  renderEmergency();
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function initNavigation() {
  document.querySelectorAll('.nav-item, .view-all').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const section = link.dataset.section;
      if (section) navigateTo(section);
      // Close sidebar on mobile
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  // Mobile menu toggle
  document.getElementById('menu-toggle').addEventListener('click', toggleSidebar);

  // Sidebar overlay
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.addEventListener('click', closeSidebar);
  document.body.appendChild(overlay);
}

function navigateTo(section) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    const isActive = item.dataset.section === section;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
  // Update sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + section)?.classList.add('active');
  state.currentSection = section;

  // Lazy renders
  if (section === 'stats') renderCharts();
  if (section === 'tracker') renderTracker();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const isOpen = sidebar.classList.toggle('open');
  document.querySelector('.sidebar-overlay').classList.toggle('active', isOpen);
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', String(isOpen));
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('active');
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', 'false');
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const todayStr = today();
  const todayLog = state.takenLog[todayStr] || {};

  const total = state.medicines.length;
  const taken = Object.values(todayLog).filter(s => s === 'taken').length;
  // pending = medicines that haven't been marked at all today
  const marked = Object.values(todayLog).filter(s => s === 'taken' || s === 'missed').length;
  const pending = total - marked;

  document.getElementById('dash-total-meds').textContent = total;
  document.getElementById('dash-taken-today').textContent = taken;
  document.getElementById('dash-pending').textContent = Math.max(0, pending);
  const waterCount = state.waterLog[todayStr] || 0;
  document.getElementById('dash-water').textContent = waterCount;

  // Medicine compact list
  const listEl = document.getElementById('dash-medicine-list');
  if (state.medicines.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">💊</div><p>No medicines added yet.</p></div>`;
  } else {
    listEl.innerHTML = state.medicines.slice(0, 4).map(med => {
      const status = todayLog[med.id] || 'pending';
      return `<div class="med-compact-item" style="border-left-color:${med.color}">
        <div class="med-compact-name">${escHtml(med.name)}</div>
        <div class="med-compact-dose">${escHtml(med.dosage)}</div>
        <button class="med-status-badge ${status}" data-medid="${med.id}" data-action="status">
          ${status === 'taken' ? '✅ Taken' : status === 'missed' ? '❌ Missed' : '⏳ Pending'}
        </button>
      </div>`;
    }).join('');
  }

  renderWater('dash');
  renderSteps('dash');
  renderMoodBadges('dash-mood');
  updateMoodText();
}

// ─── Medicines ────────────────────────────────────────────────────────────────
function renderMedicines() {
  const el = document.getElementById('medicines-list');
  if (state.medicines.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">💊</div>
      <h3>No medicines added</h3>
      <p>Click "+ Add Medicine" to get started.</p>
    </div>`;
    return;
  }

  const freqLabel = { once: 'Once daily', twice: 'Twice daily', thrice: '3x daily', weekly: 'Weekly', custom: 'As needed' };

  el.innerHTML = state.medicines.map(med => `
    <div class="medicine-card" style="border-left-color:${med.color}">
      <div class="med-card-header">
        <div class="med-card-name">${escHtml(med.name)}</div>
        <div class="med-card-actions">
          <button class="med-action-btn" data-medid="${med.id}" data-action="edit" title="Edit">✏️</button>
          <button class="med-action-btn" data-medid="${med.id}" data-action="delete" title="Delete">🗑️</button>
        </div>
      </div>
      <div>
        <span class="med-badge dosage">💊 ${escHtml(med.dosage)}</span>
        <span class="med-badge freq">🔁 ${freqLabel[med.frequency] || med.frequency}</span>
        <span class="med-badge time">🕐 ${med.timeOfDay.charAt(0).toUpperCase() + med.timeOfDay.slice(1)}</span>
      </div>
      ${med.reminder ? `<div class="med-reminder">⏰ Reminder: ${timeLabel(med.reminder)}</div>` : ''}
      ${med.notes ? `<div class="med-note">${escHtml(med.notes)}</div>` : ''}
    </div>
  `).join('');
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
function renderSchedule(activeTime) {
  const times = ['morning', 'afternoon', 'evening', 'night'];
  if (!activeTime) {
    // Determine from current hour
    const h = new Date().getHours();
    activeTime = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  }

  document.querySelectorAll('.sched-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.time === activeTime);
  });

  const todayStr = today();
  const todayLog = state.takenLog[todayStr] || {};
  const filtered = state.medicines.filter(m => m.timeOfDay === activeTime);
  const el = document.getElementById('schedule-list');

  if (filtered.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>No medicines scheduled for ${activeTime}.</p></div>`;
    return;
  }

  el.innerHTML = filtered.map(med => {
    const status = todayLog[med.id] || '';
    return `<div class="schedule-item">
      <div class="sched-dot" style="background:${med.color}"></div>
      <div class="sched-info">
        <div class="sched-name">${escHtml(med.name)}</div>
        <div class="sched-meta">${escHtml(med.dosage)}${med.reminder ? ' · ' + timeLabel(med.reminder) : ''}</div>
      </div>
      <div class="sched-time">${timeLabel(med.reminder) || ''}</div>
      <button class="take-btn ${status}" data-medid="${med.id}" data-action="toggle">
        ${status === 'taken' ? '✅ Taken' : status === 'missed' ? '❌ Missed' : '🕐 Mark'}
      </button>
    </div>`;
  }).join('');
}

// ─── Tracker ──────────────────────────────────────────────────────────────────
function renderTracker() {
  renderWater('tracker');
  renderSteps('tracker');
  renderMoodBadges('tracker-mood');
  renderMoodHistory();
}

// ─── Water ────────────────────────────────────────────────────────────────────
function renderWater(ctx) {
  const todayStr = today();
  const count = state.waterLog[todayStr] || 0;
  const goal = WATER_GOAL;
  const pct = Math.min(100, (count / goal) * 100);

  const glassesEl = ctx === 'dash' ? 'water-glasses-dash' : 'water-glasses-tracker';
  const countEl = ctx === 'dash' ? 'water-count-dash' : 'water-count-tracker';
  const progressEl = ctx === 'dash' ? 'water-progress' : 'water-progress-t';

  const glasses = document.getElementById(glassesEl);
  if (glasses) {
    glasses.innerHTML = Array.from({ length: goal }, (_, i) =>
      `<span class="glass-icon ${i < count ? 'filled' : ''}" data-idx="${i}" data-ctx="${ctx}" role="button" aria-label="Set water to ${i + 1} glasses" tabindex="0">💧</span>`
    ).join('');
  }

  const countEl2 = document.getElementById(countEl);
  if (countEl2) countEl2.textContent = `${count} / ${goal} glasses`;

  const prog = document.getElementById(progressEl);
  if (prog) prog.style.width = pct + '%';
}

function changeWater(ctx, delta) {
  const todayStr = today();
  const current = state.waterLog[todayStr] || 0;
  state.waterLog[todayStr] = Math.max(0, Math.min(WATER_GOAL, current + delta));  // WATER_GOAL is live
  saveKey('waterLog');
  renderWater('dash');
  renderWater('tracker');
  document.getElementById('dash-water').textContent = state.waterLog[todayStr];
}

// ─── Steps ────────────────────────────────────────────────────────────────────
function renderSteps(ctx) {
  const todayStr = today();
  const count = state.stepsLog[todayStr] || 0;
  const pct = Math.min(100, (count / STEPS_GOAL) * 100);  // STEPS_GOAL is live

  const countEl = ctx === 'dash' ? 'steps-count' : 'steps-count-t';
  const progressEl = ctx === 'dash' ? 'steps-progress' : 'steps-progress-t';

  const c = document.getElementById(countEl);
  if (c) c.textContent = count.toLocaleString();
  const p = document.getElementById(progressEl);
  if (p) p.style.width = pct + '%';
}

function updateSteps(ctx) {
  const inputId = ctx === 'dash' ? 'steps-input' : 'steps-input-t';
  const input = document.getElementById(inputId);
  const val = parseInt(input.value, 10);
  if (isNaN(val) || val < 0) { showToast('⚠️ Please enter a valid step count.'); return; }
  const todayStr = today();
  state.stepsLog[todayStr] = val;
  saveKey('stepsLog');
  renderSteps('dash');
  renderSteps('tracker');
  input.value = '';
  showToast('Steps updated! 🚶');
}

// ─── Mood ─────────────────────────────────────────────────────────────────────
function renderMoodBadges(containerId) {
  const todayStr = today();
  const selected = state.moodLog[todayStr];
  const el = document.getElementById(containerId);
  if (!el) return;
  el.querySelectorAll('.mood-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mood === selected);
  });
}

function updateMoodText() {
  const todayStr = today();
  const selected = state.moodLog[todayStr];
  const el = document.getElementById('mood-selected');
  if (el) el.textContent = selected ? `Today's mood: ${selected}` : '';
}

function setMood(emoji) {
  const todayStr = today();
  state.moodLog[todayStr] = emoji;
  saveKey('moodLog');
  renderMoodBadges('dash-mood');
  renderMoodBadges('tracker-mood');
  updateMoodText();
  renderMoodHistory();
  showToast('Mood saved ' + emoji);
}

function renderMoodHistory() {
  const el = document.getElementById('mood-history');
  if (!el) return;
  const entries = Object.entries(state.moodLog)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 10);

  if (entries.length === 0) {
    el.innerHTML = `<div class="mood-history-title">No mood history yet.</div>`;
    return;
  }

  el.innerHTML = `<div class="mood-history-title">Recent Moods</div>
    <div class="mood-history-list">
      ${entries.map(([date, emoji]) =>
        `<div class="mood-history-item">${emoji} <span>${formatDateShort(date)}</span></div>`
      ).join('')}
    </div>`;
}

// ─── Medication status toggle ─────────────────────────────────────────────────
function toggleMedStatus(medId) {
  const todayStr = today();
  if (!state.takenLog[todayStr]) state.takenLog[todayStr] = {};
  const current = state.takenLog[todayStr][medId] || '';
  // Cycle: '' → taken → missed → ''
  const next = current === '' ? 'taken' : current === 'taken' ? 'missed' : '';
  if (next === '') {
    delete state.takenLog[todayStr][medId];
  } else {
    state.takenLog[todayStr][medId] = next;
  }
  saveKey('takenLog');
  renderDashboard();
  renderSchedule(getActiveScheduleTab());
  showToast(next === 'taken' ? '✅ Marked as taken!' : next === 'missed' ? '❌ Marked as missed' : 'Status cleared');
}

function getActiveScheduleTab() {
  const active = document.querySelector('.sched-tab.active');
  return active ? active.dataset.time : undefined;
}

// ─── Medicine CRUD ────────────────────────────────────────────────────────────
function openMedicineModal(medId) {
  state.editingMedId = medId || null;
  state.selectedColor = '#3b82f6';

  const form = document.getElementById('medicine-form');
  form.reset();
  document.getElementById('med-edit-id').value = '';

  document.getElementById('medicine-modal-title').textContent = medId ? 'Edit Medicine' : 'Add Medicine';

  if (medId) {
    const med = state.medicines.find(m => m.id === medId);
    if (med) {
      document.getElementById('med-name').value = med.name;
      document.getElementById('med-dosage').value = med.dosage;
      document.getElementById('med-frequency').value = med.frequency;
      document.getElementById('med-time').value = med.timeOfDay;
      document.getElementById('med-reminder').value = med.reminder || '';
      document.getElementById('med-notes').value = med.notes || '';
      document.getElementById('med-edit-id').value = med.id;
      state.selectedColor = med.color || '#3b82f6';
    }
  }

  // Update color picker UI — scope to medicine modal only
  document.querySelectorAll('#med-color-picker .color-dot').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.color === state.selectedColor);
  });

  document.getElementById('modal-medicine').classList.remove('hidden');
  document.getElementById('med-name').focus();
}

document.getElementById('medicine-form').addEventListener('submit', e => {
  e.preventDefault();
  const editId = document.getElementById('med-edit-id').value;
  const name = document.getElementById('med-name').value.trim();
  const dosage = document.getElementById('med-dosage').value.trim();
  if (!name) { showToast('⚠️ Medicine name is required.'); return; }
  if (!dosage) { showToast('⚠️ Dosage is required.'); return; }
  const med = {
    id: editId || uid(),
    name,
    dosage,
    frequency: document.getElementById('med-frequency').value,
    timeOfDay: document.getElementById('med-time').value,
    reminder: document.getElementById('med-reminder').value,
    notes: document.getElementById('med-notes').value.trim(),
    color: state.selectedColor,
    createdAt: editId ? (state.medicines.find(m => m.id === editId)?.createdAt || Date.now()) : Date.now(),
  };

  if (editId) {
    const idx = state.medicines.findIndex(m => m.id === editId);
    if (idx > -1) state.medicines[idx] = med;
  } else {
    state.medicines.push(med);
  }

  saveKey('medicines');
  closeModal('modal-medicine');
  renderMedicines();
  renderDashboard();
  renderSchedule();
  showToast(editId ? 'Medicine updated!' : 'Medicine added! 💊');
});

function deleteMedicine(medId) {
  if (!confirm('Delete this medicine?')) return;
  state.medicines = state.medicines.filter(m => m.id !== medId);
  saveKey('medicines');
  renderMedicines();
  renderDashboard();
  renderSchedule();
  showToast('Medicine deleted.');
}

// ─── Appointments ─────────────────────────────────────────────────────────────
function renderAppointments() {
  const el = document.getElementById('appointments-list');
  if (state.appointments.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🏥</div>
      <h3>No appointments</h3>
      <p>Add your upcoming doctor appointments here.</p>
    </div>`;
    return;
  }

  const todayStr = today();
  const sorted = [...state.appointments].sort((a, b) => a.date.localeCompare(b.date));

  el.innerHTML = sorted.map(appt => {
    const isUpcoming = appt.date >= todayStr;
    return `<div class="appt-card">
      <div class="appt-header">
        <div>
          <div class="appt-doctor">👨‍⚕️ ${escHtml(appt.doctor)}</div>
          ${appt.specialty ? `<div class="appt-specialty">${escHtml(appt.specialty)}</div>` : ''}
        </div>
        <button class="appt-delete-btn" data-apptid="${appt.id}" data-action="delete-appt">🗑️</button>
      </div>
      <div class="appt-datetime">
        <span>📅 ${formatDate(appt.date)}</span>
        <span>· ⏰ ${timeLabel(appt.time)}</span>
      </div>
      ${appt.notes ? `<div class="med-note">${escHtml(appt.notes)}</div>` : ''}
      <span class="appt-status ${isUpcoming ? 'upcoming' : 'past'}">${isUpcoming ? '✅ Upcoming' : 'Past'}</span>
    </div>`;
  }).join('');
}

document.getElementById('appointment-form').addEventListener('submit', e => {
  e.preventDefault();
  const doctor = document.getElementById('appt-doctor').value.trim();
  const date = document.getElementById('appt-date').value;
  const time = document.getElementById('appt-time').value;
  if (!doctor) { showToast('⚠️ Doctor/Hospital name is required.'); return; }
  if (!date) { showToast('⚠️ Appointment date is required.'); return; }
  if (!time) { showToast('⚠️ Appointment time is required.'); return; }
  const appt = {
    id: uid(),
    doctor,
    specialty: document.getElementById('appt-specialty').value.trim(),
    date,
    time,
    notes: document.getElementById('appt-notes').value.trim(),
  };
  state.appointments.push(appt);
  saveKey('appointments');
  closeModal('modal-appointment');
  document.getElementById('appointment-form').reset();
  renderAppointments();
  showToast('Appointment saved! 🏥');
});

function deleteAppointment(apptId) {
  state.appointments = state.appointments.filter(a => a.id !== apptId);
  saveKey('appointments');
  renderAppointments();
  showToast('Appointment removed.');
}

// ─── Emergency contacts ───────────────────────────────────────────────────────
function renderEmergency() {
  const el = document.getElementById('contacts-list');
  if (state.contacts.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🚨</div>
      <h3>No emergency contacts</h3>
      <p>Add important contacts for quick access.</p>
    </div>`;
    return;
  }

  el.innerHTML = state.contacts.map(c => `
    <div class="contact-card">
      <div class="contact-avatar">${(c.name[0] || '?').toUpperCase()}</div>
      <div class="contact-info">
        <div class="contact-name">${escHtml(c.name)}</div>
        ${c.relation ? `<div class="contact-relation">${escHtml(c.relation)}</div>` : ''}
        <div class="contact-phone"><a href="tel:${escHtml(c.phone)}">${escHtml(c.phone)}</a></div>
      </div>
      <button class="contact-delete" data-cid="${c.id}" data-action="delete-contact">🗑️</button>
    </div>
  `).join('');
}

document.getElementById('contact-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('contact-name').value.trim();
  const phone = document.getElementById('contact-phone').value.trim();
  if (!name) { showToast('⚠️ Contact name is required.'); return; }
  if (!phone) { showToast('⚠️ Phone number is required.'); return; }
  const contact = {
    id: uid(),
    name,
    relation: document.getElementById('contact-relation').value.trim(),
    phone,
  };
  state.contacts.push(contact);
  saveKey('contacts');
  closeModal('modal-contact');
  document.getElementById('contact-form').reset();
  renderEmergency();
  showToast('Contact added!');
});

function deleteContact(cid) {
  state.contacts = state.contacts.filter(c => c.id !== cid);
  saveKey('contacts');
  renderEmergency();
  showToast('Contact removed.');
}

// ─── Charts (Stats page) ──────────────────────────────────────────────────────
function renderCharts() {
  renderAdherenceChart();
  renderWaterChart();
  renderStepsChart();
  renderMoodChart();
}

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });
}

function drawBarChart(canvasId, labels, values, color, yMax) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 400;
  const H = 220;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  ctx.clearRect(0, 0, W, H);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#9ab5d8' : '#7a9bb8';
  const gridColor = isDark ? '#233150' : '#e8f0f8';

  const PL = 42, PR = 16, PT = 16, PB = 36;
  const iW = W - PL - PR, iH = H - PT - PB;
  const max = yMax || Math.max(...values, 1);

  // Grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PT + (i / 4) * iH;
    ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(PL + iW, y); ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(max * (1 - i / 4)), PL - 5, y + 4);
  }

  // Bars
  const bW = Math.max(12, Math.min(40, iW / values.length - 6));
  values.forEach((v, i) => {
    const x = PL + (i + 0.5) * (iW / values.length) - bW / 2;
    const bH = (v / max) * iH;
    const y = PT + iH - bH;
    const grad = ctx.createLinearGradient(0, y, 0, y + bH);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + '88');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, bW, bH, 4) : ctx.rect(x, y, bW, bH);
    ctx.fill();

    // Label
    ctx.fillStyle = textColor;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], PL + (i + 0.5) * (iW / values.length), H - 8);
  });
}

function drawLineChart(canvasId, labels, values, color, yMax, yMin = 0) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 400;
  const H = 220;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  ctx.clearRect(0, 0, W, H);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#9ab5d8' : '#7a9bb8';
  const gridColor = isDark ? '#233150' : '#e8f0f8';

  const PL = 42, PR = 16, PT = 16, PB = 36;
  const iW = W - PL - PR, iH = H - PT - PB;
  const range = (yMax - yMin) || 1;

  // Grid
  ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PT + (i / 4) * iH;
    ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(PL + iW, y); ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText((yMax - (i / 4) * (yMax - yMin)).toFixed(0), PL - 5, y + 4);
  }

  if (values.length < 2) return;

  const pts = values.map((v, i) => ({
    x: PL + (i / (values.length - 1)) * iW,
    y: PT + iH - ((v - yMin) / range) * iH,
  }));

  // Area
  const grad = ctx.createLinearGradient(0, PT, 0, PT + iH);
  grad.addColorStop(0, color + '44');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, PT + iH);
  ctx.lineTo(pts[0].x, PT + iH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Dots + labels
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = isDark ? '#1a2540' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], p.x, H - 8);
  });
}

function renderAdherenceChart() {
  const days = getLast7Days();
  const labels = days.map(d => formatDateShort(d).split(' ')[0]);
  const values = days.map(d => {
    const log = state.takenLog[d] || {};
    if (state.medicines.length === 0) return 0;
    const taken = Object.values(log).filter(s => s === 'taken').length;
    return Math.round((taken / state.medicines.length) * 100);
  });
  drawBarChart('adherence-chart', labels, values, '#1d72e8', 100);
}

function renderWaterChart() {
  const days = getLast7Days();
  const labels = days.map(d => formatDateShort(d).split(' ')[0]);
  const values = days.map(d => state.waterLog[d] || 0);
  drawBarChart('water-chart', labels, values, '#3b82f6', 8);
}

function renderStepsChart() {
  const days = getLast7Days();
  const labels = days.map(d => formatDateShort(d).split(' ')[0]);
  const values = days.map(d => state.stepsLog[d] || 0);
  drawBarChart('steps-chart', labels, values, '#16a34a', 10000);
}

function renderMoodChart() {
  const moodScore = { '😄': 5, '🙂': 4, '😐': 3, '😟': 2, '😢': 1 };
  const days = getLast7Days();
  const labels = days.map(d => formatDateShort(d).split(' ')[0]);
  const values = days.map(d => moodScore[state.moodLog[d]] || 0);
  drawLineChart('mood-chart', labels, values, '#7c3aed', 5, 0);
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Close modal buttons
document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
  if (btn.dataset.modal) {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  }
});

// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

// Close modals on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const openModal = document.querySelector('.modal-overlay:not(.hidden)');
    if (openModal) { openModal.classList.add('hidden'); return; }
    // Close sidebar on mobile
    if (document.getElementById('sidebar')?.classList.contains('open')) closeSidebar();
  }
});

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 2800);
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Global event delegation ──────────────────────────────────────────────────
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'status') toggleMedStatus(el.dataset.medid);
  if (action === 'toggle') toggleMedStatus(el.dataset.medid);
  if (action === 'edit') openMedicineModal(el.dataset.medid);
  if (action === 'delete') deleteMedicine(el.dataset.medid);
  if (action === 'delete-appt') deleteAppointment(el.dataset.apptid);
  if (action === 'delete-contact') deleteContact(el.dataset.cid);
});

// Mood buttons
document.addEventListener('click', e => {
  const btn = e.target.closest('.mood-btn');
  if (btn) setMood(btn.dataset.mood);
});

// Color picker — scoped to medicine modal
document.getElementById('med-color-picker').addEventListener('click', e => {
  const dot = e.target.closest('.color-dot');
  if (!dot) return;
  state.selectedColor = dot.dataset.color;
  document.querySelectorAll('#med-color-picker .color-dot').forEach(d => d.classList.toggle('active', d === dot));
});

// Water controls
document.getElementById('water-plus').addEventListener('click', () => changeWater('dash', 1));
document.getElementById('water-minus').addEventListener('click', () => changeWater('dash', -1));
document.getElementById('water-plus-t').addEventListener('click', () => changeWater('tracker', 1));
document.getElementById('water-minus-t').addEventListener('click', () => changeWater('tracker', -1));

// Glass click (mouse + keyboard)
function handleGlassInteraction(glass) {
  if (!glass) return;
  const idx = parseInt(glass.dataset.idx, 10);
  const todayStr = today();
  state.waterLog[todayStr] = idx + 1;
  saveKey('waterLog');
  renderWater('dash');
  renderWater('tracker');
  document.getElementById('dash-water').textContent = state.waterLog[todayStr];
}
document.addEventListener('click', e => {
  const glass = e.target.closest('.glass-icon');
  handleGlassInteraction(glass);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    const glass = e.target.closest('.glass-icon');
    if (glass) { e.preventDefault(); handleGlassInteraction(glass); }
  }
});

// Steps
document.getElementById('steps-update').addEventListener('click', () => updateSteps('dash'));
document.getElementById('steps-update-t').addEventListener('click', () => updateSteps('tracker'));
document.getElementById('steps-input').addEventListener('keydown', e => { if (e.key === 'Enter') updateSteps('dash'); });
document.getElementById('steps-input-t').addEventListener('keydown', e => { if (e.key === 'Enter') updateSteps('tracker'); });

// Schedule tabs
document.querySelectorAll('.sched-tab').forEach(tab => {
  tab.addEventListener('click', () => renderSchedule(tab.dataset.time));
});

// Add medicine button
document.getElementById('add-medicine-btn').addEventListener('click', () => openMedicineModal(null));

// Add appointment button
document.getElementById('add-appt-btn').addEventListener('click', () => {
  document.getElementById('appointment-form').reset();
  document.getElementById('modal-appointment').classList.remove('hidden');
});

// Add contact button
document.getElementById('add-contact-btn').addEventListener('click', () => {
  document.getElementById('contact-form').reset();
  document.getElementById('modal-contact').classList.remove('hidden');
});

// Theme toggles
document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
document.getElementById('mobile-theme-toggle').addEventListener('click', toggleTheme);

// ─── Bootstrap ────────────────────────────────────────────────────────────────
loadState();
applyTheme(state.theme);
initAuth();
initNavigation();

// Update greeting time
setInterval(() => {
  const el = document.getElementById('greeting-time');
  if (el) el.textContent = getGreeting();
}, 60000);
