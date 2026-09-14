/* ============================================================
   RSVP BACKEND — Google Apps Script Web App
   Sheet 1 (RSVP): A=Guest ID, B=Guest Name, C=Responded,
                   D=Responded Date, E=RSVP
   Sheet 2 (Wedding Details): labels in column A, values in column B
   ============================================================ */

const SHEET_ID      = '1CUvVFKa-QvoxVBb1dz6_1kJtTm2BMim_4wdX2_KgPZ0';
const RSVP_SHEET    = 'Respondents';
const DETAILS_SHEET = 'Wedding Details';

const ID_COL         = 1;   // A - Guest ID
const NAME_COL       = 2;   // B - Guest Name
const RESPONDED_COL  = 3;   // C - Responded (Yes/blank)
const RESPONDED_DT   = 4;   // D - Responded Date
const ATTEND_COL     = 5;   // E - RSVP (Yes/No)

/* ============================================================
   WEDDING DETAILS
   Layout:
     A1=Groom               B1
     A2=Bride               B2
     A4=Date                B4
     A6=Church Name         B6
     A7=Church Address      B7
     A8=Time                B8
     A10=Reception Name     B10
     A11=Reception Address  B11
     A12=Time               B12
     A14=Submit By:         B14
     A16=One Time RSVP      B16
     A18=Password           B18
   ============================================================ */
function getWeddingDetails() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(DETAILS_SHEET);
  if (!sheet) throw new Error('Wedding Details tab not found: ' + DETAILS_SHEET);

  const lastRow = Math.max(sheet.getLastRow(), 20);
  const data = sheet.getRange(1, 1, lastRow, 2).getDisplayValues();
  const b = (row) => String(data[row - 1]?.[1] || '').trim();

  return {
    groom: b(1),
    bride: b(2),
    date:  b(4),
    church: {
      name:    b(6),
      address: b(7),
      time:    b(8)
    },
    reception: {
      name:    b(10),
      address: b(11),
      time:    b(12)
    },
    rsvpBy: b(14),
    oneTimeRsvp: /^(yes|true|y|1)$/i.test(b(16)),
    adminPassword: b(18)
  };
}

/* ---------- QUERY 1: name → Guest ID(s) ---------- */
function findIdsByName(name) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(RSVP_SHEET);
  if (!sheet) throw new Error('RSVP tab not found: ' + RSVP_SHEET);

  const data = sheet.getDataRange().getDisplayValues();
  const ids = new Set();

  for (let i = 1; i < data.length; i++) {
    const rowName = String(data[i][NAME_COL - 1] || '').trim().toLowerCase();
    if (rowName === name) {
      const id = String(data[i][ID_COL - 1] || '').trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/* ---------- QUERY 2: Guest ID → all rows under it ---------- */
function findGuestsByGuestId(guestId) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(RSVP_SHEET);
  const data = sheet.getDataRange().getDisplayValues();
  const guests = [];

  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][ID_COL - 1] || '').trim();
    if (id === guestId) {
      guests.push({
        row:            i + 1,
        guestId:        data[i][ID_COL - 1],
        name:           data[i][NAME_COL - 1],
        attended:       data[i][ATTEND_COL - 1] || '',
        responded:      data[i][RESPONDED_COL - 1] || '',
        respondedDate:  data[i][RESPONDED_DT - 1] || ''
      });
    }
  }
  return guests;
}

/* ---------- ADMIN: return every guest row ---------- */
function getAllGuests() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(RSVP_SHEET);
  if (!sheet) throw new Error('RSVP tab not found: ' + RSVP_SHEET);

  const data = sheet.getDataRange().getDisplayValues();
  const guests = [];

  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][NAME_COL - 1] || '').trim();
    const id   = String(data[i][ID_COL - 1] || '').trim();
    if (!name && !id) continue;

    guests.push({
      row:            i + 1,
      guestId:        data[i][ID_COL - 1],
      name:           data[i][NAME_COL - 1],
      attended:       data[i][ATTEND_COL - 1] || '',
      responded:      data[i][RESPONDED_COL - 1] || '',
      respondedDate:  data[i][RESPONDED_DT - 1] || ''
    });
  }
  return guests;
}

/* ---------- GET ---------- */
function doGet(e) {
  const action = (e.parameter.action || '').trim();

  try {
    if (action === 'search') {
      const name = (e.parameter.name || '').trim().toLowerCase();
      if (!name) return json({ found: false, guests: [], ids: [] });

      const ids = findIdsByName(name);
      if (ids.length === 0) return json({ found: false, guests: [], ids: [] });

      const guests = [];
      ids.forEach(id => findGuestsByGuestId(id).forEach(m => guests.push(m)));
      guests.sort((a, b) => a.row - b.row);

      return json({ found: guests.length > 0, guests, ids });
    }

    if (action === 'details') {
      return json({ success: true, details: getWeddingDetails() });
    }

    if (action === 'all') {
      // Server-side password check
      const supplied = (e.parameter.pw || '').trim();
      const expected = getWeddingDetails().adminPassword;
      if (!expected || supplied !== expected) {
        return json({ success: false, error: 'unauthorized' });
      }
      return json({ success: true, guests: getAllGuests() });
    }

    return json({ error: 'bad action' });
  } catch (err) {
    return json({ error: String(err) });
  }
}

/* ---------- POST ---------- */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action !== 'update') return json({ error: 'bad action' });

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(RSVP_SHEET);
    const now = new Date();
    const tz = Session.getScriptTimeZone();
    const stamp = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');

    body.updates.forEach(u => {
      sheet.getRange(u.row, ATTEND_COL).setValue(u.attending);

      const respondedCell = sheet.getRange(u.row, RESPONDED_COL);
      if (!String(respondedCell.getValue() || '').trim()) {
        respondedCell.setValue('Yes');
      }

      const dateCell = sheet.getRange(u.row, RESPONDED_DT);
      if (!String(dateCell.getValue() || '').trim()) {
        dateCell.setValue(stamp);
      }
    });

    return json({ success: true, updated: body.updates.length, timestamp: stamp });
  } catch (err) {
    return json({ error: String(err) });
  }
}

/* ---------- helpers ---------- */
function json(o) {
  return ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}