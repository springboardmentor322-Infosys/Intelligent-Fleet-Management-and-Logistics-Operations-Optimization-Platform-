export function getStoredToken() {
  return sessionStorage.getItem('fleetflow-token') || localStorage.getItem('fleetflow-token') || '';
}

export function setStoredToken(token, remember = false) {
  if (!token) {
    sessionStorage.removeItem('fleetflow-token');
    localStorage.removeItem('fleetflow-token');
    return;
  }
  if (remember) {
    localStorage.setItem('fleetflow-token', token);
    sessionStorage.removeItem('fleetflow-token');
  } else {
    sessionStorage.setItem('fleetflow-token', token);
    localStorage.removeItem('fleetflow-token');
  }
}

export async function apiRequest(url, options = {}, token = getStoredToken()) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Something went wrong');
  return value;
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
