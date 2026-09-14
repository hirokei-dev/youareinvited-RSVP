/* ============================================================
   WEDDING RSVP — app.js
   1. Load wedding details from Google Sheet
   2. Theme picker
   3. Background picker
   4. RSVP search + submit (with One-Time RSVP lock)
   ============================================================ */

/* Global holder for details so the RSVP block can read the flag */
let weddingDetails = null;

/* ============================================================
   1. WEDDING DETAILS LOADER
   ============================================================ */
(async function loadWeddingDetails() {
  console.log('[APP] Loading wedding details...');

  const getPath = (obj, path) =>
    path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : ''), obj);

  function fillFields(details) {
    document.querySelectorAll('[data-field]').forEach(el => {
      const value = getPath(details, el.dataset.field);
      if (value !== '' && value !== null && value !== undefined) {
        el.textContent = value;
      }
    });
  }

  try {
    if (typeof API === 'undefined') {
      console.error('[APP] API object not found — is api.js loaded before app.js?');
      return;
    }

    const res = await API.getDetails();
    console.log('[APP] Details response:', res);

    if (!res || !res.success || !res.details) {
      console.warn('[APP] Details payload invalid:', res);
      return;
    }

    weddingDetails = res.details;

    fillFields(weddingDetails);

    if (weddingDetails.bride && weddingDetails.groom) {
      document.title = `${weddingDetails.bride} & ${weddingDetails.groom} · RSVP`;
    }

    // Fill the couple names without touching the "&" structure
    const brideEl = document.querySelector('.name-bride');
    const groomEl = document.querySelector('.name-groom');
    if (brideEl && weddingDetails.bride) brideEl.textContent = weddingDetails.bride;
    if (groomEl && weddingDetails.groom) groomEl.textContent = weddingDetails.groom;

    console.log('[APP] Wedding details loaded. oneTimeRsvp =', weddingDetails.oneTimeRsvp);
  } catch (err) {
    console.error('[APP] Failed to load wedding details:', err);
  }
})();

/* ============================================================
   2. THEME PICKER
   ============================================================ */
(function initThemePicker() {
  const picker = document.getElementById('themePicker');
  if (!picker) return;

  const THEMES = [
    'ivory','blush','sage','dustyblue','terracotta',
    'lavender','champagne','navygold','emerald','burgundy',
    'slate','rosegold','mint','midnight','peach',
    'charcoal','sky','plum','sand','ocean',
    'coral','teal','mustard','olive','mauve',
    'forest','wine','cocoa','stone','cloud',
    'honey','denim','moss','clay','indigo',
    'salmon','pistachio','plum2','greige','onyx',
    'sunset','lagoon','wheat','fern','brick',
    'orchid','graphite','linen','pearl','rosewood'
  ];

  picker.innerHTML = THEMES.map(t => `<option value="${t}">${t}</option>`).join('');
  picker.value = document.documentElement.dataset.theme || 'ivory';
  picker.addEventListener('change', e => {
    document.documentElement.dataset.theme = e.target.value;
    window.dispatchEvent(new Event('themeChanged'));
  });
})();

/* ============================================================
   3. BACKGROUND PICKER
   ============================================================ */
(function initBgPicker() {
  const picker = document.getElementById('bgPicker');
  if (!picker) return;
  picker.value = (typeof window.getBgMode === 'function') ? window.getBgMode() : 'particles';
  picker.addEventListener('change', e => {
    if (typeof window.setBgMode === 'function') window.setBgMode(e.target.value);
  });
})();

/* ============================================================
   4. RSVP — SEARCH + SUBMIT
   ============================================================ */
(function initRsvp() {
  const $ = id => document.getElementById(id);

  const searchInput  = $('searchName');
  const searchBtn    = $('searchBtn');
  const searchMsg    = $('searchMsg');
  const resultsDiv   = $('results');
  const guestListDiv = $('guestList');
  const resultsSub   = $('resultsSub');
  const submitBtn    = $('submitBtn');
  const submitMsg    = $('submitMsg');

  if (!searchInput || !searchBtn) {
    console.warn('[APP] RSVP elements not found, skipping init.');
    return;
  }

  let currentGuests = [];
  let alreadyResponded = false;

  // ---------- small helpers ----------
  const showMsg = (el, text, type = 'info') => {
    if (!el) return;
    el.textContent = text;
    el.className = 'msg show ' + type;
  };
  const hideMsg = el => { if (el) el.className = 'msg'; };

  // Ensure there's a place for the "already responded" notice
  function ensureNoticeEl() {
    let el = document.getElementById('oneTimeNotice');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'oneTimeNotice';
    el.className = 'msg info one-time';
    el.style.display = 'none';
    if (submitBtn && submitBtn.parentNode) {
      submitBtn.parentNode.insertBefore(el, submitBtn);
    }
    return el;
  }
  const noticeEl = ensureNoticeEl();

  // ---------- events ----------
  searchBtn.addEventListener('click', searchGuest);
  searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); searchGuest(); }
  });

  /* ----------------------------------------------------------
     SEARCH
     ---------------------------------------------------------- */
  async function searchGuest() {
    const name = searchInput.value.trim();
    if (!name) return showMsg(searchMsg, 'Please enter your full name.', 'error');
    if (typeof API === 'undefined') return showMsg(searchMsg, 'RSVP system not ready.', 'error');

    hideMsg(searchMsg);
    hideMsg(submitMsg);
    if (noticeEl) noticeEl.style.display = 'none';
    resultsDiv.classList.remove('show');
    alreadyResponded = false;

    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching...';

    try {
      const data = await API.search(name);
      console.log('[APP] Search response:', data);

      if (data && data.found && Array.isArray(data.guests) && data.guests.length) {
        currentGuests = data.guests;

        // ---- One-Time RSVP check ----
        const oneTime = !!(weddingDetails && weddingDetails.oneTimeRsvp);
        alreadyResponded = oneTime && currentGuests.some(g =>
          String(g.responded || '').trim() !== '' ||
          String(g.respondedDate || '').trim() !== ''
        );
        console.log('[APP] oneTime =', oneTime, '| alreadyResponded =', alreadyResponded);

        renderGuests(data.ids || [], alreadyResponded);
        resultsDiv.classList.add('show');

        const total   = data.guests.length;
        const idCount = (data.ids || []).length;

        if (alreadyResponded) {
          showMsg(searchMsg, `Found ${total} guest(s) — you've already responded.`, 'info');
        } else {
          showMsg(searchMsg,
            total === 1
              ? `Found 1 guest matching "${name}".`
              : `Found ${total} guest(s) under ${idCount} Guest ID${idCount > 1 ? 's' : ''} — please confirm attendance for each.`,
            'info');
        }
      } else {
        showMsg(searchMsg, `No RSVP found for "${name}". Please check the spelling or contact the couple.`, 'error');
      }
    } catch (err) {
      console.error('[APP] Search error:', err);
      showMsg(searchMsg, 'Could not reach the RSVP system. Please try again.', 'error');
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Search';
    }
  }

  /* ----------------------------------------------------------
     RENDER
     ---------------------------------------------------------- */
  function renderGuests(ids, locked) {
    if (!guestListDiv) return;
    guestListDiv.innerHTML = '';

    if (resultsSub) {
      const idList = ids.length ? ids.join(', ') : String(currentGuests[0].guestId);
      resultsSub.textContent =
        `Grouped by Guest ID ${idList} — all members of each group are shown.`;
    }

    currentGuests.forEach((g, idx) => {
      const prev = String(g.attended || '').toLowerCase();
      const checked = ['yes', 'y', 'true', 'attending'].includes(prev);

      const row = document.createElement('div');
      row.className = 'guest-row' + (locked ? ' locked' : '');

      const currentLabel = (() => {
        if (prev === 'yes' || prev === 'y' || prev === 'true') return 'Attending';
        if (prev === 'no') return 'Not going';
        return 'Not responded';
      })();

      row.innerHTML = `
        <div class="guest-info">
          <span class="guest-name">${escapeHtml(String(g.name || ''))}</span>
          <span class="guest-id">Guest ID: ${escapeHtml(String(g.guestId || ''))}</span>
        </div>
        <label class="toggle">
          <input type="checkbox" data-index="${idx}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}>
          <span class="track"></span>
          <span class="toggle-label">${locked ? currentLabel : (checked ? 'Attending' : 'Not going')}</span>
        </label>`;
      guestListDiv.appendChild(row);
    });

    guestListDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', e => {
        const lbl = e.target.closest('.toggle').querySelector('.toggle-label');
        if (lbl) lbl.textContent = e.target.checked ? 'Attending' : 'Not going';
      });
    });

    // ---- One-Time RSVP replacement message + hide the submit ----
    if (locked) {
      if (noticeEl) {
        noticeEl.textContent =
          'You have already submitted your RSVP. If you want to change it, kindly message the Groom & Bride. Thank you!';
        noticeEl.style.display = 'block';
      }
      if (submitBtn) submitBtn.style.display = 'none';
    } else {
      if (noticeEl) noticeEl.style.display = 'none';
      if (submitBtn) submitBtn.style.display = '';
    }
  }

  /* ----------------------------------------------------------
     SUBMIT
     ---------------------------------------------------------- */
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      console.log('[APP] Submit clicked.');

      if (!guestListDiv) return;
      if (typeof API === 'undefined') return showMsg(submitMsg, 'RSVP system not ready.', 'error');
      if (alreadyResponded) {
        console.warn('[APP] Already responded — submission blocked.');
        return;
      }

      const boxes = guestListDiv.querySelectorAll('input[type="checkbox"]');
      const updates = [];
      boxes.forEach((cb, i) => {
        updates.push({
          row: currentGuests[i].row,
          attending: cb.checked ? 'Yes' : 'No'
        });
      });

      if (!updates.length) {
        console.warn('[APP] No updates to send.');
        return;
      }

      console.log('[APP] Sending updates:', updates);

      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      hideMsg(submitMsg);

      try {
        const data = await API.update(updates);
        console.log('[APP] Update response:', data);

        if (data && data.success) {
          showMsg(submitMsg,
            `Thank you! RSVP for ${updates.length} guest(s) has been recorded.`,
            'success');

          // Update local state
          updates.forEach((u, i) => {
            currentGuests[i].attended      = u.attending;
            currentGuests[i].responded     = 'Yes';
            currentGuests[i].respondedDate = data.timestamp || 'now';
          });

          // If One-Time RSVP is enabled, lock the form immediately
          if (weddingDetails && weddingDetails.oneTimeRsvp) {
            alreadyResponded = true;
            renderGuests([], true);
          }
        } else {
          showMsg(submitMsg, 'Something went wrong. Please try again.', 'error');
        }
      } catch (err) {
        console.error('[APP] Submit error:', err);
        showMsg(submitMsg, 'Network error. Please try again.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Attendance';
      }
    });
  }
})();

/* ============================================================
   Utilities
   ============================================================ */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}