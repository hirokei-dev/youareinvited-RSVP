/* ============================================================
   ADMIN VIEW — server-side password gate, reads RSVP responses
   ============================================================ */

const SESSION_KEY = 'weddingAdminAuthed';
let   adminPassword = null;      // stored in memory after successful login

/* ============================================================
   1. PASSWORD GATE
   ============================================================ */
(function initGate() {
  const gate     = document.getElementById('adminGate');
  const wrap     = document.getElementById('adminWrap');
  const loading  = document.getElementById('adminLoading');
  const input    = document.getElementById('adminPassword');
  const loginBtn = document.getElementById('adminLoginBtn');
  const msg      = document.getElementById('adminGateMsg');

  // Fast path — already authed in this browser session
  const savedPw = sessionStorage.getItem(SESSION_KEY);
  if (savedPw) {
    adminPassword = savedPw;
    gate.hidden = true;
    wrap.hidden = false;
    return initDashboard();
  }

  async function tryLogin() {
    const entered = input.value.trim();
    if (!entered) {
      msg.textContent = 'Please enter the password.';
      msg.className = 'msg error show';
      return;
    }

    // Show loading, verify against the server
    gate.hidden = true;
    loading.hidden = false;

    try {
      const res = await API.getAll(entered);
      console.log('[ADMIN] verify response:', res);

      if (res && res.success && Array.isArray(res.guests)) {
        // Password accepted — remember for this session
        adminPassword = entered;
        sessionStorage.setItem(SESSION_KEY, entered);

        // Small pause so the spinner shows
        await new Promise(r => setTimeout(r, 300));

        loading.hidden = true;
        wrap.hidden = false;
        return initDashboard(res.guests);   // pass data we already fetched
      }

      // Bad password — go back to the gate
      loading.hidden = true;
      gate.hidden = false;
      msg.textContent = 'Incorrect password.';
      msg.className = 'msg error show';
      input.value = '';
      input.focus();

    } catch (err) {
      console.error('[ADMIN] verify error:', err);
      loading.hidden = true;
      gate.hidden = false;
      msg.textContent = 'Could not reach the server. Please try again.';
      msg.className = 'msg error show';
    }
  }

  loginBtn.addEventListener('click', tryLogin);
  input.addEventListener('keypress', e => {
    if (e.key === 'Enter') tryLogin();
  });
  input.focus();
})();

/* ============================================================
   2. DASHBOARD
   ============================================================ */
function initDashboard(initialGuests) {
  const els = {
    subtitle:         document.getElementById('adminSubtitle'),
    statTotal:        document.getElementById('statTotal'),
    statResponded:    document.getElementById('statResponded'),
    statRespondedPct: document.getElementById('statRespondedPct'),
    statAttending:    document.getElementById('statAttending'),
    statNot:          document.getElementById('statNotAttending'),
    statPending:      document.getElementById('statPending'),
    progressFill:     document.getElementById('progressFill'),
    tbody:            document.getElementById('adminTableBody'),
    chips:            document.getElementById('filterChips'),
    search:           document.getElementById('adminSearch'),
    refreshBtn:       document.getElementById('refreshBtn'),
    exportBtn:        document.getElementById('exportBtn'),
    logoutBtn:        document.getElementById('logoutBtn'),
    footer:           document.getElementById('adminFooter')
  };

  let allGuests = [];
  let filter = 'all';
  let search = '';

  // --- events ---
  els.refreshBtn.addEventListener('click', loadGuests);
  els.exportBtn.addEventListener('click', exportCsv);
  els.search.addEventListener('input', e => {
    search = e.target.value.trim().toLowerCase();
    renderTable();
  });
  els.chips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    els.chips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.filter;
    renderTable();
  });
  els.logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    adminPassword = null;
    location.reload();
  });

  // --- initial load ---
  if (Array.isArray(initialGuests)) {
    allGuests = initialGuests;
    renderStats();
    renderTable();
    els.footer.textContent =
      `Loaded ${allGuests.length} guest(s) · ${new Date().toLocaleString()}`;
  } else {
    loadGuests();
  }

  async function loadGuests() {
    els.tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">Loading…</td></tr>';
    try {
      const data = await API.getAll(adminPassword);
      console.log('[ADMIN] guests response:', data);

      if (!data || !data.success || !Array.isArray(data.guests)) {
        if (data && data.error === 'unauthorized') {
          // Password changed on the sheet — force re-login
          sessionStorage.removeItem(SESSION_KEY);
          location.reload();
          return;
        }
        els.tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">No data returned.</td></tr>';
        return;
      }
      allGuests = data.guests;
      renderStats();
      renderTable();
      els.footer.textContent =
        `Loaded ${allGuests.length} guest(s) · ${new Date().toLocaleString()}`;
    } catch (err) {
      console.error('[ADMIN] load error:', err);
      els.tbody.innerHTML =
        '<tr><td colspan="5" class="admin-empty">Failed to load. Check the console.</td></tr>';
    }
  }

  // --- stats ---
  function renderStats() {
    const total     = allGuests.length;
    const responded = allGuests.filter(isResponded).length;
    const attending = allGuests.filter(isAttending).length;
    const notAtt    = allGuests.filter(isNotAttending).length;
    const pending   = total - responded;
    const pct       = total ? Math.round((responded / total) * 100) : 0;

    els.statTotal.textContent        = total;
    els.statResponded.textContent    = responded;
    els.statRespondedPct.textContent = `${pct}% of guests`;
    els.statAttending.textContent    = attending;
    els.statNot.textContent          = notAtt;
    els.statPending.textContent      = pending;
    els.progressFill.style.width     = pct + '%';
  }

  // --- table ---
  function renderTable() {
    let rows = allGuests.slice();

    if (filter === 'attending')     rows = rows.filter(isAttending);
    if (filter === 'not-attending') rows = rows.filter(isNotAttending);
    if (filter === 'pending')       rows = rows.filter(g => !isResponded(g));

    if (search) {
      rows = rows.filter(g =>
        String(g.name    || '').toLowerCase().includes(search) ||
        String(g.guestId || '').toLowerCase().includes(search)
      );
    }

    if (!rows.length) {
      els.tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">No matching guests.</td></tr>';
      return;
    }

    els.tbody.innerHTML = rows.map(g => {
      const pill = isAttending(g)
        ? '<span class="pill pill-yes">Yes</span>'
        : isNotAttending(g)
          ? '<span class="pill pill-no">No</span>'
          : '<span class="pill pill-pending">Pending</span>';

      return `
        <tr>
          <td>${escapeHtml(String(g.guestId || ''))}</td>
          <td>${escapeHtml(String(g.name || ''))}</td>
          <td>${pill}</td>
          <td>${escapeHtml(String(g.responded || ''))}</td>
          <td>${escapeHtml(String(g.respondedDate || ''))}</td>
        </tr>`;
    }).join('');
  }

  // --- csv ---
  function exportCsv() {
    const headers = ['Guest ID', 'Guest Name', 'RSVP', 'Responded', 'Responded Date'];
    const rows = allGuests.map(g => [
      g.guestId || '',
      g.name || '',
      isAttending(g) ? 'Yes' : isNotAttending(g) ? 'No' : '',
      g.responded || '',
      g.respondedDate || ''
    ]);

    const csv = [headers, ...rows]
      .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `rsvp-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- helpers ---
  function isResponded(g) {
    return String(g.responded || '').trim() !== '' ||
           String(g.respondedDate || '').trim() !== '';
  }
  function isAttending(g) {
    const v = String(g.attended || '').trim().toLowerCase();
    return v === 'yes' || v === 'y' || v === 'true';
  }
  function isNotAttending(g) {
    const v = String(g.attended || '').trim().toLowerCase();
    return v === 'no' || v === 'n' || v === 'false';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
}