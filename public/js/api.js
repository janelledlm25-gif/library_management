(function () {
  const API_BASE = location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const TOKEN_KEY = 'cccAccessToken';
  const USER_KEY = 'cccCurrentUser';
  function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    let result;
    try { result = await response.json(); } catch { result = { success: false, data: null, message: 'The server returned an invalid response.' }; }
    if (response.status === 401 && path !== '/auth/login' && path !== '/mobile/login') {
      clearSession();
      const app = document.getElementById('app'); const login = document.getElementById('loginPage');
      if (app) app.classList.add('hidden'); if (login) login.classList.remove('hidden');
    }
    if (!response.ok || result.success === false) {
      const error = new Error(result.message || `Request failed (${response.status}).`); error.status = response.status; throw error;
    }
    return result.data;
  }
  window.api = {
    request,
    get: path => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    delete: path => request(path, { method: 'DELETE' }),
    saveSession(data) { localStorage.setItem(TOKEN_KEY, data.token); localStorage.setItem(USER_KEY, JSON.stringify(data.user)); },
    clearSession,
    getSession() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } }
  };
})();
