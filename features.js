/* ═══════════════════════════════════════════════
   MedTrack — features.js
   All new feature logic. Runs AFTER script.js.
   Shares the global `state` object from script.js.
════════════════════════════════════════════════ */

/* ─── Wait for DOM + script.js ─────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Wait one tick so script.js event listeners fire first
  setTimeout(initFeatures, 0);
});

function initFeatures() {
  initPWA();
  initNotifications();
  initCalendar();
  initHistory();
  initDoctors();
  initPrescriptions();
  initFamily();
  initAI();
  initSettings();
  initMedicineSearch();
  extendNavigation();
  patchMedicinesSection();
  registerServiceWorker();
  scheduleReminderChecks();
}

/* ════════════════════════════════════════════════
   PWA — Install prompt
════════════════════════════════════════════════ */
let deferredPrompt = null;

function initPWA() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showPWABanner();
    const btn = document.getElementById('pwa-install-btn');
    if (btn) { btn.disabled = false; btn.onclick = triggerInstall; }
  });

  window.addEventListener('appinstalled', () => {
    hidePWABanner();
    deferredPrompt = null;
    showToast('✅ MedTrack installed!');
  });
}

function showPWABanner() {
  if (document.getElementById('pwa-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.className = 'pwa-banner';
  banner.innerHTML = `
    <span style="font-size:28px">💊</span>
    <div class="pwa-banner-text">
      <strong>Install MedTrack</strong>
      <span>Add to home screen for offline access</span>
    </div>
    <div class="pwa-banner-actions">
      <button class="btn-primary small" id="pwa-install-trigger">Install</button>
      <button class="pwa-dismiss" id="pwa-dismiss-btn" title="Dismiss">✕</button>
    </div>`;
  document.body.appendChild(banner);
  document.getElementById('pwa-install-trigger').onclick = triggerInstall;
  document.getElementById('pwa-dismiss-btn').onclick = hidePWABanner;
}

function hidePWABanner() {
  const b = document.getElementById('pwa-banner');
  if (b) b.remove();
}

async function triggerInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') showToast('✅ Installing MedTrack…');
  deferredPrompt = null;
  hidePWABanner();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

/* ════════════════════════════════════════════════
   NOTIFICATIONS
════════════════════════════════════════════════ */
let reminderInterval = null;

function initNotifications() {
  const toggle = document.getElementById('setting-notif');
  if (toggle) {
    const enabled = store.get('notifEnabled') === true;
    toggle.checked = enabled;
    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        const granted = await requestNotifPermission();
        if (!granted) { toggle.checked = false; return; }
        store.set('notifEnabled', true);
        scheduleReminderChecks();
        showToast('🔔 Notifications enabled');
      } else {
        store.set('notifEnabled', false);
        clearInterval(reminderInterval);
        showToast('🔕 Notifications disabled');
      }
    });
  }
}

async function requestNotifPermission() {
  if (!('Notification' in window)) { showToast('⚠️ Notifications not supported'); return false; }
  if (Notification.permission === 'granted') return true;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

function scheduleReminderChecks() {
  clearInterval(reminderInterval);
  if (!store.get('notifEnabled')) return;
  checkReminders();
  reminderInterval = setInterval(checkReminders, 60000);
}

function checkReminders() {
  if (Notification.permission !== 'granted') return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hh}:${mm}`;
  const advance = parseInt(store.get('advanceNotif') || '10', 10);
  const todayStr = today();
  const log = state.takenLog[todayStr] || {};

  state.medicines.forEach(med => {
    if (!med.reminder) return;
    if (log[med.id] === 'taken') return;
    const [rh, rm] = med.reminder.split(':').map(Number);
    const reminderTotal = rh * 60 + rm - advance;
    const nowTotal = now.getHours() * 60 + now.getMinutes();
    if (nowTotal === reminderTotal) {
      triggerMedNotification(med);
    }
  });
}

function triggerMedNotification(med) {
  const n = new Notification(`💊 Time for ${med.name}`, {
    body: `Dosage: ${med.dosage} — Tap to open MedTrack`,
    icon: './icons/icon.svg',
    badge: './icons/icon.svg',
    tag: `med-${med.id}`,
  });
  n.onclick = () => { window.focus(); n.close(); };

  // Sound
  if (store.get('soundEnabled') !== false) playBeep();
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(); osc.stop(ctx.currentTime + 0.6);
  } catch (_) {}
}

/* ════════════════════════════════════════════════
   CALENDAR
════════════════════════════════════════════════ */
const calState = { year: new Date().getFullYear(), month: new Date().getMonth() };

function initCalendar() {
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    calState.month--;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    renderCalendar();
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    calState.month++;
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    renderCalendar();
  });
}

function renderCalendar() {
  const { year, month } = calState;
  const label = new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const el = document.getElementById('cal-month-label');
  if (el) el.textContent = label;

  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const todayStr = today();

  let html = days.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  // Prev month filler
  for (let i = 0; i < firstDay; i++) {
    const d = daysInPrev - firstDay + i + 1;
    html += `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`;
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = iso === todayStr;
    const log = state.takenLog[iso] || {};
    const meds = getFamilyMedicines();
    let dots = '';
    meds.forEach(med => {
      const st = log[med.id];
      if (st === 'taken') dots += `<span class="cal-dot taken"></span>`;
      else if (st === 'missed') dots += `<span class="cal-dot missed"></span>`;
      else if (Object.keys(log).length === 0 && iso <= todayStr && meds.length > 0) { /* no dots for past empty */ }
    });
    html += `<div class="cal-day ${isToday ? 'today' : ''}" data-date="${iso}" data-action="cal-day">
      <div class="cal-day-num">${d}</div>
      <div class="cal-dots">${dots}</div>
    </div>`;
  }

  // Next month filler
  const total = firstDay + daysInMonth;
  const remaining = 7 - (total % 7 === 0 ? 7 : total % 7);
  for (let d = 1; d <= remaining && remaining < 7; d++) {
    html += `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`;
  }

  grid.innerHTML = html;
}

function showCalDayDetail(iso) {
  const detail = document.getElementById('cal-day-detail');
  if (!detail) return;

  detail.classList.remove('hidden');
  const log = state.takenLog[iso] || {};
  const meds = getFamilyMedicines();

  let html = `<div class="cal-detail-date">📅 ${formatDate(iso)}</div>`;
  if (meds.length === 0) {
    html += `<div style="color:var(--muted);font-size:13px">No medicines for this profile.</div>`;
  } else {
    meds.forEach(med => {
      const st = log[med.id] || 'pending';
      const icon = st === 'taken' ? '✅' : st === 'missed' ? '❌' : '⏳';
      html += `<div class="cal-detail-item">
        <div class="cal-detail-dot" style="background:${med.color}"></div>
        <span>${escHtml(med.name)} — ${escHtml(med.dosage)}</span>
        <span style="margin-left:auto">${icon} ${st}</span>
      </div>`;
    });
  }

  detail.innerHTML = html;

  // Highlight selected
  document.querySelectorAll('.cal-day.selected').forEach(d => d.classList.remove('selected'));
  document.querySelector(`.cal-day[data-date="${iso}"]`)?.classList.add('selected');
}

/* ════════════════════════════════════════════════
   HISTORY + EXPORT
════════════════════════════════════════════════ */
function initHistory() {
  document.getElementById('export-csv-btn')?.addEventListener('click', exportCSV);
  document.getElementById('export-pdf-btn')?.addEventListener('click', exportPDF);
}

function renderHistory() {
  renderHistorySummary();
  renderHistoryList();
}

function renderHistorySummary() {
  const el = document.getElementById('history-summary');
  if (!el) return;
  const meds = getFamilyMedicines();
  const allDays = Object.keys(state.takenLog).sort().reverse();
  let totalDoses = 0, takenCount = 0, missedCount = 0;

  allDays.forEach(d => {
    const log = state.takenLog[d] || {};
    meds.forEach(m => {
      totalDoses++;
      if (log[m.id] === 'taken') takenCount++;
      if (log[m.id] === 'missed') missedCount++;
    });
  });

  const adherence = totalDoses > 0 ? Math.round((takenCount / totalDoses) * 100) : 0;
  el.innerHTML = `
    <div class="hist-stat"><div class="hist-stat-val">${allDays.length}</div><div class="hist-stat-label">Days Tracked</div></div>
    <div class="hist-stat"><div class="hist-stat-val green">${takenCount}</div><div class="hist-stat-label">Doses Taken</div></div>
    <div class="hist-stat"><div class="hist-stat-val red">${missedCount}</div><div class="hist-stat-label">Doses Missed</div></div>
    <div class="hist-stat"><div class="hist-stat-val ${adherence >= 80 ? '' : adherence >= 50 ? 'orange' : 'red'}">${adherence}%</div><div class="hist-stat-label">Overall Adherence</div></div>
  `;
}

function renderHistoryList() {
  const el = document.getElementById('history-list');
  if (!el) return;
  const meds = getFamilyMedicines();
  const allDays = Object.keys(state.takenLog).sort().reverse().slice(0, 30);

  if (allDays.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No history yet. Mark medicines as taken or missed to build history.</p></div>`;
    return;
  }

  el.innerHTML = allDays.map(d => {
    const log = state.takenLog[d] || {};
    const taken = meds.filter(m => log[m.id] === 'taken').length;
    const total = meds.length;
    const pct = total > 0 ? Math.round((taken / total) * 100) : 0;
    const cls = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';

    const rows = meds.map(m => {
      const st = log[m.id] || 'pending';
      const stColor = st === 'taken' ? 'var(--green)' : st === 'missed' ? 'var(--red)' : 'var(--muted)';
      const stBg = st === 'taken' ? 'var(--green-light)' : st === 'missed' ? 'var(--red-light)' : 'var(--border)';
      return `<div class="hist-med-row">
        <div class="hist-med-dot" style="background:${m.color}"></div>
        <span>${escHtml(m.name)} — ${escHtml(m.dosage)}</span>
        <span class="hist-med-status" style="background:${stBg};color:${stColor}">${st}</span>
      </div>`;
    }).join('');

    return `<div class="history-day">
      <div class="history-day-header" data-action="toggle-hist-day">
        <span>📅 ${formatDate(d)}</span>
        <span class="adherence-pill ${cls}">${pct}% (${taken}/${total})</span>
      </div>
      <div class="history-day-body">${rows}</div>
    </div>`;
  }).join('');
}

function exportCSV() {
  const meds = getFamilyMedicines();
  const allDays = Object.keys(state.takenLog).sort().reverse();
  const rows = [['Date', ...meds.map(m => `${m.name} (${m.dosage})`)]];
  allDays.forEach(d => {
    const log = state.takenLog[d] || {};
    rows.push([d, ...meds.map(m => log[m.id] || 'pending')]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadFile('medtrack-history.csv', 'text/csv', csv);
  showToast('📥 CSV downloaded');
}

function exportPDF() {
  const meds = getFamilyMedicines();
  const allDays = Object.keys(state.takenLog).sort().reverse().slice(0, 30);
  const lines = allDays.map(d => {
    const log = state.takenLog[d] || {};
    const taken = meds.filter(m => log[m.id] === 'taken').length;
    const pct = meds.length > 0 ? Math.round((taken / meds.length) * 100) : 0;
    return `${d}: ${taken}/${meds.length} taken (${pct}%)`;
  }).join('\n');

  const content = `MedTrack — Medicine History Report
Generated: ${new Date().toLocaleString()}
Profile: ${getActiveProfileName()}

=== Summary ===
${lines}

=== Medicines ===
${meds.map(m => `• ${m.name} ${m.dosage} — ${m.timeOfDay} (${m.frequency})`).join('\n')}
`;
  // Open print window as PDF alternative
  const win = window.open('', '_blank');
  if (!win) { showToast('⚠️ Allow popups to export PDF'); return; }
  win.document.write(`<html><head><title>MedTrack Report</title>
    <style>body{font-family:monospace;padding:30px;white-space:pre;font-size:13px;color:#1f2328;}</style>
    </head><body>${escHtml(content)}</body></html>`);
  win.document.close();
  win.print();
  showToast('🖨️ Print dialog opened for PDF');
}

function downloadFile(name, type, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ════════════════════════════════════════════════
   DOCTORS
════════════════════════════════════════════════ */
function initDoctors() {
  document.getElementById('add-doctor-btn')?.addEventListener('click', () => openDoctorModal(null));
  document.getElementById('doctor-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const editId = document.getElementById('doc-edit-id').value;
    const name = document.getElementById('doc-name').value.trim();
    if (!name) { showToast('⚠️ Doctor name is required.'); return; }
    const doc = {
      id: editId || uid(),
      name,
      specialty: document.getElementById('doc-specialty').value.trim(),
      phone: document.getElementById('doc-phone').value.trim(),
      email: document.getElementById('doc-email').value.trim(),
      clinic: document.getElementById('doc-clinic').value.trim(),
      notes: document.getElementById('doc-notes').value.trim(),
    };
    if (!state.doctors) state.doctors = [];
    if (editId) {
      const idx = state.doctors.findIndex(d => d.id === editId);
      if (idx > -1) state.doctors[idx] = doc;
    } else {
      state.doctors.push(doc);
    }
    store.set('doctors', state.doctors);
    closeModal('modal-doctor');
    document.getElementById('doctor-form').reset();
    renderDoctors();
    showToast(editId ? 'Doctor updated' : 'Doctor added 👨‍⚕️');
  });
}

function openDoctorModal(docId) {
  document.getElementById('doc-edit-id').value = '';
  document.getElementById('doctor-form').reset();
  document.getElementById('doctor-modal-title').textContent = docId ? 'Edit Doctor' : 'Add Doctor';
  if (docId) {
    const doc = state.doctors.find(d => d.id === docId);
    if (doc) {
      document.getElementById('doc-edit-id').value = doc.id;
      document.getElementById('doc-name').value = doc.name || '';
      document.getElementById('doc-specialty').value = doc.specialty || '';
      document.getElementById('doc-phone').value = doc.phone || '';
      document.getElementById('doc-email').value = doc.email || '';
      document.getElementById('doc-clinic').value = doc.clinic || '';
      document.getElementById('doc-notes').value = doc.notes || '';
    }
  }
  document.getElementById('modal-doctor').classList.remove('hidden');
}

function renderDoctors() {
  const el = document.getElementById('doctors-list');
  if (!el) return;
  if (!state.doctors || state.doctors.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">👨‍⚕️</div><h3>No doctors added</h3><p>Add your doctors for quick access.</p></div>`;
    return;
  }
  el.innerHTML = state.doctors.map(doc => `
    <div class="doctor-card">
      <div class="doctor-avatar">${(doc.name[0] || 'D').toUpperCase()}</div>
      <div class="doctor-name">${escHtml(doc.name)}</div>
      ${doc.specialty ? `<div class="doctor-specialty">${escHtml(doc.specialty)}</div>` : ''}
      ${doc.phone ? `<div class="doctor-info-row">📞 <a href="tel:${escHtml(doc.phone)}">${escHtml(doc.phone)}</a></div>` : ''}
      ${doc.email ? `<div class="doctor-info-row">✉️ <a href="mailto:${escHtml(doc.email)}">${escHtml(doc.email)}</a></div>` : ''}
      ${doc.clinic ? `<div class="doctor-info-row">🏥 ${escHtml(doc.clinic)}</div>` : ''}
      ${doc.notes ? `<div class="med-note">${escHtml(doc.notes)}</div>` : ''}
      <div class="doctor-actions">
        <button class="btn-secondary" style="flex:1;font-size:12px" data-docid="${doc.id}" data-action="edit-doc">✏️ Edit</button>
        <button class="btn-danger" style="padding:7px 12px;font-size:12px" data-docid="${doc.id}" data-action="delete-doc">🗑️</button>
      </div>
    </div>`).join('');
}

function deleteDoctor(id) {
  if (!confirm('Remove this doctor?')) return;
  state.doctors = (state.doctors || []).filter(d => d.id !== id);
  store.set('doctors', state.doctors);
  renderDoctors();
  showToast('Doctor removed');
}

/* ════════════════════════════════════════════════
   PRESCRIPTIONS
════════════════════════════════════════════════ */
function initPrescriptions() {
  document.getElementById('add-rx-btn')?.addEventListener('click', () => {
    document.getElementById('prescription-form').reset();
    document.getElementById('rx-preview').classList.add('hidden');
    document.getElementById('rx-upload-placeholder').style.display = '';
    document.getElementById('modal-prescription').classList.remove('hidden');
    // Set today's date
    document.getElementById('rx-date').value = today();
  });

  document.getElementById('rx-upload-area')?.addEventListener('click', () => {
    document.getElementById('rx-file').click();
  });

  // Drag & drop
  const area = document.getElementById('rx-upload-area');
  if (area) {
    area.addEventListener('dragover', e => { e.preventDefault(); area.style.borderColor = 'var(--primary)'; });
    area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
    area.addEventListener('drop', e => { e.preventDefault(); area.style.borderColor = ''; handleRxFile(e.dataTransfer.files[0]); });
  }

  document.getElementById('rx-file')?.addEventListener('change', e => handleRxFile(e.target.files[0]));

  document.getElementById('prescription-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const title = document.getElementById('rx-title').value.trim();
    if (!title) { showToast('⚠️ Title is required.'); return; }
    const rx = {
      id: uid(),
      title,
      doctor: document.getElementById('rx-doctor').value.trim(),
      date: document.getElementById('rx-date').value,
      notes: document.getElementById('rx-notes').value.trim(),
      dataUrl: store.get('rxTempFile') || null,
      isPdf: store.get('rxTempIsPdf') || false,
    };
    if (!state.prescriptions) state.prescriptions = [];
    state.prescriptions.push(rx);
    store.set('prescriptions', state.prescriptions);
    store.del('rxTempFile');
    store.del('rxTempIsPdf');
    closeModal('modal-prescription');
    document.getElementById('prescription-form').reset();
    document.getElementById('rx-preview').classList.add('hidden');
    document.getElementById('rx-upload-placeholder').style.display = '';
    renderPrescriptions();
    showToast('Prescription saved 📄');
  });
}

function handleRxFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('⚠️ File too large (max 5MB)'); return; }
  const reader = new FileReader();
  reader.onload = evt => {
    const dataUrl = evt.target.result;
    const isPdf = file.type === 'application/pdf';
    store.set('rxTempFile', dataUrl);
    store.set('rxTempIsPdf', isPdf);
    const preview = document.getElementById('rx-preview');
    const placeholder = document.getElementById('rx-upload-placeholder');
    placeholder.style.display = 'none';
    preview.classList.remove('hidden');
    preview.innerHTML = isPdf
      ? `<div style="text-align:center;padding:20px;font-size:32px">📄 <br><span style="font-size:13px;color:var(--muted)">${escHtml(file.name)}</span></div>`
      : `<img src="${dataUrl}" alt="Preview" />`;
  };
  reader.readAsDataURL(file);
}

function renderPrescriptions() {
  const el = document.getElementById('prescriptions-list');
  if (!el) return;
  if (!state.prescriptions || state.prescriptions.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📄</div><h3>No prescriptions</h3><p>Upload prescription images or PDFs.</p></div>`;
    return;
  }
  el.innerHTML = state.prescriptions.map(rx => {
    const thumb = rx.dataUrl
      ? (rx.isPdf ? `<div class="rx-pdf-thumb">📄</div>` : `<img class="rx-preview-thumb" src="${rx.dataUrl}" alt="${escHtml(rx.title)}" />`)
      : `<div class="rx-pdf-thumb" style="font-size:32px">📋</div>`;
    return `<div class="rx-card">
      ${thumb}
      <div class="rx-card-body">
        <div class="rx-title">${escHtml(rx.title)}</div>
        <div class="rx-meta">${rx.doctor ? '👨‍⚕️ ' + escHtml(rx.doctor) + ' · ' : ''}${rx.date ? formatDateShort(rx.date) : ''}</div>
        ${rx.notes ? `<div class="med-note">${escHtml(rx.notes)}</div>` : ''}
        <div class="rx-card-actions">
          ${rx.dataUrl ? `<button class="btn-secondary" style="font-size:12px;flex:1" data-rxid="${rx.id}" data-action="view-rx">👁 View</button>` : ''}
          <button class="btn-danger" style="padding:7px 12px;font-size:12px" data-rxid="${rx.id}" data-action="delete-rx">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function viewPrescription(id) {
  const rx = (state.prescriptions || []).find(r => r.id === id);
  if (!rx || !rx.dataUrl) return;
  if (rx.isPdf) {
    // For PDFs, use an object/embed approach
    const win = window.open();
    if (!win) { showToast('⚠️ Allow popups to view'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>${escHtml(rx.title)}</title></head>
      <body style="margin:0;height:100vh">
        <embed src="${rx.dataUrl}" type="application/pdf" width="100%" height="100%" />
      </body></html>`);
    win.document.close();
    return;
  }
  const win = window.open();
  if (!win) { showToast('⚠️ Allow popups to view'); return; }
  win.document.write(`<!DOCTYPE html><html><head><title>${escHtml(rx.title)}</title></head>
    <body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh">
    <img src="${rx.dataUrl}" alt="${escHtml(rx.title)}" style="max-width:100%;max-height:100vh" /></body></html>`);
  win.document.close();
}

function deleteRx(id) {
  if (!confirm('Delete this prescription?')) return;
  state.prescriptions = (state.prescriptions || []).filter(r => r.id !== id);
  store.set('prescriptions', state.prescriptions);
  renderPrescriptions();
  showToast('Prescription deleted');
}

/* ════════════════════════════════════════════════
   FAMILY PROFILES
════════════════════════════════════════════════ */
let selectedMemberColor = '#1d72e8';

function initFamily() {
  document.getElementById('add-member-btn')?.addEventListener('click', () => {
    document.getElementById('member-form').reset();
    selectedMemberColor = '#1d72e8';
    document.querySelectorAll('#member-color-picker .color-dot').forEach(d => {
      d.classList.toggle('active', d.dataset.color === selectedMemberColor);
    });
    document.getElementById('modal-member').classList.remove('hidden');
  });

  document.getElementById('member-color-picker')?.addEventListener('click', e => {
    const dot = e.target.closest('.color-dot');
    if (!dot) return;
    selectedMemberColor = dot.dataset.color;
    document.querySelectorAll('#member-color-picker .color-dot').forEach(d => {
      d.classList.toggle('active', d === dot);
    });
  });

  document.getElementById('member-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('member-name').value.trim();
    if (!name) { showToast('⚠️ Member name is required.'); return; }
    const member = {
      id: uid(),
      name,
      relation: document.getElementById('member-relation').value.trim(),
      age: document.getElementById('member-age').value,
      color: selectedMemberColor,
      medicines: [],
    };
    if (!state.familyMembers) state.familyMembers = [];
    state.familyMembers.push(member);
    store.set('familyMembers', state.familyMembers);
    closeModal('modal-member');
    renderFamily();
    showToast('Family member added 👨‍👩‍👧');
  });
}

function renderFamily() {
  const el = document.getElementById('family-list');
  if (!el) return;
  const activeMemberId = store.get('activeMemberId');

  if (!state.familyMembers || state.familyMembers.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">👨‍👩‍👧</div><h3>No family members</h3><p>Add family members to manage their medicines separately.</p></div>`;
    renderActiveMemberBanner();
    return;
  }

  el.innerHTML = state.familyMembers.map(m => {
    const isActive = m.id === activeMemberId;
    const medCount = (state.familyMedMap || {})[m.id]?.length || 0;
    return `<div class="family-card ${isActive ? 'active-member' : ''}" data-memberid="${m.id}" data-action="select-member">
      <div class="family-avatar" style="background:${m.color}">${m.name[0].toUpperCase()}</div>
      <div class="family-name">${escHtml(m.name)}</div>
      ${m.relation ? `<div class="family-relation">${escHtml(m.relation)}</div>` : ''}
      ${m.age ? `<div class="family-relation">Age: ${escHtml(m.age)}</div>` : ''}
      <div class="family-med-count">${medCount} medicines</div>
      <div class="family-card-actions">
        <button class="btn-secondary" style="font-size:11px;padding:4px 10px" data-memberid="${m.id}" data-action="delete-member">🗑️</button>
      </div>
    </div>`;
  }).join('');

  renderActiveMemberBanner();
}

function selectMember(id) {
  store.set('activeMemberId', id);
  renderFamily();
  renderDashboard();
  renderMedicines();
  renderSchedule();
  const member = state.familyMembers.find(m => m.id === id);
  showToast(`Switched to ${member?.name || 'member'} 👤`);
}

function renderActiveMemberBanner() {
  const el = document.getElementById('active-member-banner');
  if (!el) return;
  const activeMemberId = store.get('activeMemberId');
  if (!activeMemberId) { el.classList.add('hidden'); return; }
  const member = state.familyMembers?.find(m => m.id === activeMemberId);
  if (!member) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `<span>📌 Viewing medicines for: <strong>${escHtml(member.name)}</strong></span>
    <button class="btn-secondary" style="font-size:12px;padding:5px 12px" id="clear-member-btn">Switch to My Profile</button>`;
  document.getElementById('clear-member-btn')?.addEventListener('click', () => {
    store.del('activeMemberId');
    renderFamily();
    renderDashboard();
    renderMedicines();
    showToast('Switched to your profile');
  });
}

function deleteMember(id) {
  if (!confirm('Remove this family member?')) return;
  state.familyMembers = (state.familyMembers || []).filter(m => m.id !== id);
  store.set('familyMembers', state.familyMembers);
  if (store.get('activeMemberId') === id) store.del('activeMemberId');
  renderFamily();
  showToast('Member removed');
}

function getFamilyMedicines() {
  return state.medicines || [];
}

function getActiveProfileName() {
  const id = store.get('activeMemberId');
  if (!id) return state.user?.name || 'Me';
  return state.familyMembers?.find(m => m.id === id)?.name || 'Me';
}

/* ════════════════════════════════════════════════
   AI HEALTH ASSISTANT
════════════════════════════════════════════════ */
const AI_KNOWLEDGE = {
  keywords: {
    'paracetamol|acetaminophen': 'Paracetamol (acetaminophen) is used for pain relief and fever reduction. Typical adult dosage is 500–1000mg every 4–6 hours, maximum 4g/day. Do not exceed the recommended dose and avoid alcohol.',
    'ibuprofen': 'Ibuprofen is an NSAID used for pain, fever, and inflammation. Typical adult dosage is 200–400mg every 4–6 hours. Take with food to reduce stomach irritation. Avoid if you have kidney issues or ulcers.',
    'blood pressure|hypertension|amlodipine|lisinopril': 'For blood pressure medicines: take them at the same time every day, never skip doses, and monitor your BP regularly. Common medicines include ACE inhibitors, beta-blockers, and calcium channel blockers.',
    'diabetes|metformin|insulin': 'Diabetes medications help control blood sugar. Metformin is usually taken with meals. Always monitor your blood glucose as directed. Maintain a healthy diet and regular exercise alongside medication.',
    'antibiotic': 'Always complete the full course of antibiotics even if you feel better. Take at evenly-spaced intervals. Some antibiotics should be taken with food. Avoid alcohol with certain antibiotics.',
    'water|hydration': 'The recommended daily water intake is 8 glasses (about 2 liters). Staying hydrated supports kidney function, digestion, and energy levels. Increase intake during exercise or hot weather.',
    'sleep': 'Adults need 7–9 hours of sleep per night. Good sleep hygiene includes a regular schedule, dark/cool room, and avoiding screens before bed. Poor sleep can worsen many health conditions.',
    'exercise|steps|walk': 'The WHO recommends at least 150 minutes of moderate exercise per week. A daily goal of 10,000 steps is a common benchmark. Regular physical activity reduces risk of heart disease, diabetes, and depression.',
    'mood|depression|anxiety': 'Mental health matters. If you feel consistently low or anxious, speak to a healthcare professional. Regular exercise, sleep, social connection, and mindfulness all support mood. Never stop prescribed medications abruptly.',
    'reminder|missed dose': 'If you miss a dose: take it as soon as you remember unless it\'s close to your next dose — in that case, skip and continue normally. Never double up doses. Set phone reminders to build consistency.',
    'side effect': 'All medications can have side effects. Common ones include nausea, headache, or dizziness. Read the patient information leaflet. Contact your doctor if side effects are severe or persistent.',
  },
  default: "I'm your MedTrack health assistant. I can answer questions about your medicines, dosage reminders, health tracking, water intake, exercise, and general wellness. For specific medical advice, please consult a qualified healthcare professional.\n\nTry asking:\n• 'How much water should I drink?'\n• 'What happens if I miss a dose?'\n• 'What are common side effects?'\n• 'Tips for better sleep'"
};

function initAI() {
  const savedKey = store.get('geminiKey') || '';
  const keyInput = document.getElementById('ai-api-key');
  if (keyInput) keyInput.value = savedKey;

  document.getElementById('ai-save-key')?.addEventListener('click', () => {
    const k = (document.getElementById('ai-api-key')?.value || '').trim();
    store.set('geminiKey', k);
    showToast(k ? '🔑 API key saved' : 'API key cleared');
  });

  document.getElementById('ai-send')?.addEventListener('click', sendAIMessage);
  document.getElementById('ai-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
  });

  // Quick chips
  const chips = ['Missed a dose?', 'Water intake tips', 'Exercise benefits', 'Sleep tips', 'My medicines', 'Side effects'];
  const chipsEl = document.getElementById('ai-quick-chips');
  if (chipsEl) {
    chipsEl.innerHTML = chips.map(c => `<button class="quick-chip" data-topic="${escHtml(c)}">${escHtml(c)}</button>`).join('');
    chipsEl.addEventListener('click', e => {
      const chip = e.target.closest('.quick-chip');
      if (chip) {
        document.getElementById('ai-input').value = chip.dataset.topic;
        sendAIMessage();
      }
    });
  }

  // Welcome message
  appendAIMsg('bot', "👋 Hi! I'm your MedTrack AI Health Assistant.\n\nI can help with medicine information, dosage reminders, health tips, and tracking questions.\n\nAsk me anything, or tap a quick topic on the left!");
}

function appendAIMsg(role, text) {
  const el = document.getElementById('ai-messages');
  if (!el) return;
  const div = document.createElement('div');
  div.className = `ai-msg ${role}`;
  div.innerHTML = `
    <div class="ai-msg-avatar">${role === 'user' ? '👤' : '🤖'}</div>
    <div class="ai-msg-bubble">${escHtml(text)}</div>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  return div;
}

function appendThinking() {
  const el = document.getElementById('ai-messages');
  if (!el) return;
  const div = document.createElement('div');
  div.className = 'ai-msg bot thinking';
  div.innerHTML = `<div class="ai-msg-avatar">🤖</div><div class="ai-msg-bubble">Thinking… <span class="spinner"></span></div>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  return div;
}

async function sendAIMessage() {
  const input = document.getElementById('ai-input');
  if (!input) return;
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  input.style.height = '';

  appendAIMsg('user', q);
  const thinking = appendThinking();

  const apiKey = (store.get('geminiKey') || '').trim();

  let answer;
  if (apiKey) {
    answer = await callGeminiAPI(apiKey, q);
  } else {
    answer = await getBuiltinAnswer(q);
  }

  thinking?.remove();
  appendAIMsg('bot', answer);
}

async function callGeminiAPI(apiKey, prompt) {
  const systemCtx = `You are a helpful health assistant for the MedTrack app. The user has ${state.medicines?.length || 0} medicines. Provide concise, accurate health and medication guidance. Always recommend consulting a doctor for medical decisions.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: systemCtx + '\n\nUser: ' + prompt }] }] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
  } catch (err) {
    return `⚠️ API error: ${err.message}. Falling back to built-in knowledge.\n\n${await getBuiltinAnswer(prompt)}`;
  }
}

async function getBuiltinAnswer(q) {
  const lower = q.toLowerCase();

  // Check for my medicines query
  if (/my medicine|what.*take|current med/i.test(lower)) {
    const meds = getFamilyMedicines();
    if (meds.length === 0) return "You haven't added any medicines yet. Go to the Medicines section to add them.";
    return `You have ${meds.length} medicine(s):\n${meds.map(m => `• ${m.name} ${m.dosage} — ${m.timeOfDay}${m.reminder ? ' at ' + timeLabel(m.reminder) : ''}`).join('\n')}`;
  }

  // Check knowledge base
  for (const [pattern, answer] of Object.entries(AI_KNOWLEDGE.keywords)) {
    if (new RegExp(pattern, 'i').test(lower)) return answer;
  }

  // Simulate a slight delay for realism
  await new Promise(r => setTimeout(r, 600));
  return AI_KNOWLEDGE.default;
}

/* ════════════════════════════════════════════════
   SETTINGS
════════════════════════════════════════════════ */
function initSettings() {
  // Sound
  const soundToggle = document.getElementById('setting-sound');
  if (soundToggle) {
    soundToggle.checked = store.get('soundEnabled') !== false;
    soundToggle.addEventListener('change', () => {
      store.set('soundEnabled', soundToggle.checked);
      showToast(soundToggle.checked ? '🔊 Sound on' : '🔇 Sound off');
    });
  }

  // Advance notice
  const advance = document.getElementById('setting-advance');
  if (advance) {
    advance.value = store.get('advanceNotif') || '10';
    advance.addEventListener('change', () => { store.set('advanceNotif', advance.value); showToast('⏱ Advance notice saved'); });
  }

  // Theme
  const themeSelect = document.getElementById('setting-theme');
  if (themeSelect) {
    themeSelect.value = state.theme || 'light';
    themeSelect.addEventListener('change', () => {
      state.theme = themeSelect.value;
      applyTheme(state.theme);
      store.set('theme', state.theme);
      showToast(`Theme set to ${state.theme}`);
    });
  }

  // Language (cosmetic — store preference)
  const lang = document.getElementById('setting-lang');
  if (lang) {
    lang.value = store.get('lang') || 'en';
    lang.addEventListener('change', () => { store.set('lang', lang.value); showToast('Language preference saved (UI not yet localized)'); });
  }

  // Export backup
  document.getElementById('backup-export-btn')?.addEventListener('click', () => {
    const backup = {
      version: 1,
      date: new Date().toISOString(),
      medicines: state.medicines,
      appointments: state.appointments,
      contacts: state.contacts,
      doctors: state.doctors || [],
      prescriptions: (state.prescriptions || []).map(rx => ({ ...rx, dataUrl: null })),
      familyMembers: state.familyMembers || [],
      takenLog: state.takenLog,
      waterLog: state.waterLog,
      stepsLog: state.stepsLog,
      moodLog: state.moodLog,
      settings: {
        theme: state.theme,
        stepsGoal: store.get('stepsGoal'),
        waterGoal: store.get('waterGoal'),
      }
    };
    downloadFile(`medtrack-backup-${today()}.json`, 'application/json', JSON.stringify(backup, null, 2));
    showToast('💾 Backup exported');
  });

  // Import backup
  document.getElementById('backup-import-file')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data.version) throw new Error('Invalid backup file');
        if (!confirm('This will overwrite your current data. Continue?')) return;
        if (data.medicines) { state.medicines = data.medicines; saveKey('medicines'); }
        if (data.appointments) { state.appointments = data.appointments; saveKey('appointments'); }
        if (data.contacts) { state.contacts = data.contacts; saveKey('contacts'); }
        if (data.doctors) { state.doctors = data.doctors; saveKey('doctors'); }
        if (data.familyMembers) { state.familyMembers = data.familyMembers; saveKey('familyMembers'); }
        if (data.takenLog) { state.takenLog = data.takenLog; saveKey('takenLog'); }
        if (data.waterLog) { state.waterLog = data.waterLog; saveKey('waterLog'); }
        if (data.stepsLog) { state.stepsLog = data.stepsLog; saveKey('stepsLog'); }
        if (data.moodLog) { state.moodLog = data.moodLog; saveKey('moodLog'); }
        initAppUI?.();
        renderDoctors(); renderFamily(); renderPrescriptions(); renderHistory();
        showToast('✅ Backup restored!');
      } catch (err) {
        showToast('⚠️ Invalid backup file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Clear data
  document.getElementById('clear-data-btn')?.addEventListener('click', () => {
    if (!confirm('⚠️ This will permanently delete ALL your data. Are you absolutely sure?')) return;
    if (!confirm('Last warning: ALL medicines, history, and settings will be deleted.')) return;
    const keysToKeep = ['users', 'session', 'theme'];
    Object.keys(localStorage).filter(k => k.startsWith('medtrack_') && !keysToKeep.includes(k.replace('medtrack_', ''))).forEach(k => localStorage.removeItem(k));
    loadState?.();
    initAppUI?.();
    showToast('🗑️ All data cleared');
  });

  // Goals
  const stepsGoalInput = document.getElementById('setting-steps-goal');
  const waterGoalInput = document.getElementById('setting-water-goal');
  if (stepsGoalInput) stepsGoalInput.value = store.get('stepsGoal') || 10000;
  if (waterGoalInput) waterGoalInput.value = store.get('waterGoal') || 8;
  document.getElementById('save-goals-btn')?.addEventListener('click', () => {
    const sg = Math.max(1000, Math.min(50000, parseInt(stepsGoalInput?.value, 10) || 10000));
    const wg = Math.max(1, Math.min(20, parseInt(waterGoalInput?.value, 10) || 8));
    store.set('stepsGoal', sg);
    store.set('waterGoal', wg);
    // Update live constants so renders reflect new goals immediately
    STEPS_GOAL = sg;
    WATER_GOAL = wg;
    renderDashboard();
    renderTracker();
    showToast('Goals saved ✅');
  });
}

/* ════════════════════════════════════════════════
   MEDICINE SEARCH & FILTER
════════════════════════════════════════════════ */
const filterState = { search: '', time: '', freq: '', sort: 'name' };

function initMedicineSearch() {
  document.getElementById('filter-medicines-btn')?.addEventListener('click', () => {
    document.getElementById('filter-search').value = filterState.search;
    document.getElementById('filter-time').value = filterState.time;
    document.getElementById('filter-freq').value = filterState.freq;
    document.getElementById('filter-sort').value = filterState.sort;
    document.getElementById('modal-filter').classList.remove('hidden');
  });

  document.getElementById('filter-apply')?.addEventListener('click', () => {
    filterState.search = document.getElementById('filter-search').value.trim().toLowerCase();
    filterState.time = document.getElementById('filter-time').value;
    filterState.freq = document.getElementById('filter-freq').value;
    filterState.sort = document.getElementById('filter-sort').value;
    closeModal('modal-filter');
    renderMedicinesFiltered();
  });

  document.getElementById('filter-reset')?.addEventListener('click', () => {
    filterState.search = ''; filterState.time = ''; filterState.freq = ''; filterState.sort = 'name';
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-time').value = '';
    document.getElementById('filter-freq').value = '';
    document.getElementById('filter-sort').value = 'name';
  });
}

function patchMedicinesSection() {
  // Add inline search bar to medicines section
  const listEl = document.getElementById('medicines-list');
  if (!listEl) return;
  const searchDiv = document.createElement('div');
  searchDiv.className = 'med-search-bar';
  searchDiv.innerHTML = `<span>🔍</span><input type="text" id="med-inline-search" placeholder="Search medicines..." />`;
  listEl.parentNode.insertBefore(searchDiv, listEl);

  document.getElementById('med-inline-search')?.addEventListener('input', e => {
    filterState.search = e.target.value.trim().toLowerCase();
    renderMedicinesFiltered();
  });
}

function renderMedicinesFiltered() {
  const freqLabel = { once: 'Once daily', twice: 'Twice daily', thrice: '3x daily', weekly: 'Weekly', custom: 'As needed' };
  let meds = [...(state.medicines || [])];

  if (filterState.search) meds = meds.filter(m => m.name.toLowerCase().includes(filterState.search) || m.dosage.toLowerCase().includes(filterState.search));
  if (filterState.time) meds = meds.filter(m => m.timeOfDay === filterState.time);
  if (filterState.freq) meds = meds.filter(m => m.frequency === filterState.freq);

  meds.sort((a, b) => {
    if (filterState.sort === 'name-desc') return b.name.localeCompare(a.name);
    if (filterState.sort === 'time') return a.timeOfDay.localeCompare(b.timeOfDay);
    if (filterState.sort === 'newest') return b.id.localeCompare(a.id);
    return a.name.localeCompare(b.name);
  });

  const el = document.getElementById('medicines-list');
  if (!el) return;

  if (meds.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">${state.medicines?.length === 0 ? '💊' : '🔍'}</div><h3>${state.medicines?.length === 0 ? 'No medicines added' : 'No matches found'}</h3><p>${state.medicines?.length === 0 ? 'Click "+ Add Medicine" to get started.' : 'Try a different search or filter.'}</p></div>`;
    return;
  }

  el.innerHTML = meds.map(med => `
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
    </div>`).join('');
}

/* ════════════════════════════════════════════════
   NAVIGATION EXTENSION — new sections
════════════════════════════════════════════════ */
function extendNavigation() {
  // Wrap navigateTo so new-section renders are triggered without re-registering
  // click handlers (those are already registered in script.js initNavigation).
  const origNavigateTo = window.navigateTo;
  window.navigateTo = function(section) {
    origNavigateTo?.(section);
    handleNewSection(section);
  };
}

function handleNewSection(section) {
  if (section === 'calendar') {
    calState.year = new Date().getFullYear();
    calState.month = new Date().getMonth();
    renderCalendar();
  }
  if (section === 'history') renderHistory();
  if (section === 'doctors') renderDoctors();
  if (section === 'prescriptions') renderPrescriptions();
  if (section === 'family') renderFamily();
  if (section === 'medicines') renderMedicinesFiltered();
  if (section === 'settings') syncSettingsUI();
}

function syncSettingsUI() {
  const themeSelect = document.getElementById('setting-theme');
  if (themeSelect) themeSelect.value = state.theme || 'light';
  const notifToggle = document.getElementById('setting-notif');
  if (notifToggle) notifToggle.checked = store.get('notifEnabled') === true;
}

/* ════════════════════════════════════════════════
   GLOBAL EVENT DELEGATION (new actions)
════════════════════════════════════════════════ */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'cal-day') showCalDayDetail(el.dataset.date);
  if (action === 'toggle-hist-day') el.closest('.history-day')?.querySelector('.history-day-body')?.classList.toggle('open');
  if (action === 'edit-doc') openDoctorModal(el.dataset.docid);
  if (action === 'delete-doc') deleteDoctor(el.dataset.docid);
  if (action === 'view-rx') viewPrescription(el.dataset.rxid);
  if (action === 'delete-rx') deleteRx(el.dataset.rxid);
  if (action === 'select-member') {
    if (!e.target.closest('[data-action="delete-member"]')) selectMember(el.dataset.memberid);
  }
  if (action === 'delete-member') { e.stopPropagation(); deleteMember(el.dataset.memberid); }
});

/* ════════════════════════════════════════════════
   STATE EXTENSION — add missing keys
════════════════════════════════════════════════ */
// Patch loadState to also load new keys
const _origLoadState = window.loadState;
window.loadState = function() {
  _origLoadState?.();
  state.doctors = store.get('doctors') || [];
  state.prescriptions = store.get('prescriptions') || [];
  state.familyMembers = store.get('familyMembers') || [];
  state.familyMedMap = store.get('familyMedMap') || {};
};
// Also run immediately since loadState already ran
state.doctors = store.get('doctors') || [];
state.prescriptions = store.get('prescriptions') || [];
state.familyMembers = store.get('familyMembers') || [];
state.familyMedMap = store.get('familyMedMap') || {};

/* ════════════════════════════════════════════════
   ACCESSIBILITY
════════════════════════════════════════════════ */
function injectSkipLink() {
  if (document.querySelector('.skip-link')) return;
  const link = document.createElement('a');
  link.href = '#section-dashboard';
  link.className = 'skip-link';
  link.textContent = 'Skip to main content';
  document.body.prepend(link);
}
injectSkipLink();

// NOTE: today(), escHtml(), uid(), formatDate(), formatDateShort(), timeLabel()
// are defined in script.js and available globally. No duplicates needed here.
