/* ============================================================
   GOOGLE SHEETS CONNECTOR
   Exposes:  API.search(name)        → { found, guests, ids }
             API.update(updates)     → { success, updated }
             API.getDetails()        → { success, details }
             API.getAll(password)    → { success, guests }
   ============================================================ */

const API = (() => {

  const API_URL = 'https://script.google.com/macros/s/AKfycbxSKuzemM_UJGVy217wRkxS765yAieGOmCXhdndHGgxtMzAgaobGahgTVhtAIHV8dvI/exec';

  async function get(params) {
    const url = `${API_URL}?${new URLSearchParams(params).toString()}`;
    console.log('[API] GET', url);
    const res = await fetch(url);
    console.log('[API] status', res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function post(body) {
    console.log('[API] POST', body);
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    console.log('[API] status', res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  return {
    async search(name)         { return get({ action: 'search', name }); },
    async update(updates)      { return post({ action: 'update', updates }); },
    async getDetails()         { return get({ action: 'details' }); },
    async getAll(password)     { return get({ action: 'all', pw: password }); }
  };
})();