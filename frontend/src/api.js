const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
export const API_URL = API;
export const WS_URL = API.replace(/^http/, "ws");

export const getToken = () => localStorage.getItem("token");
export const setToken = (t) => localStorage.setItem("token", t);
export const clearToken = () => localStorage.removeItem("token");

// Download a file (Excel / PDF export) that needs the login token, so a plain link cannot be used.
export async function download(path, filename) {
  const token = getToken();
  const res = await fetch(API + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(typeof data?.detail === "string" ? data.detail : "Download failed");
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function api(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && token) {
    clearToken();
    window.location.reload();
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data?.detail;
    throw new Error(
      typeof d === "string"
        ? d
        : Array.isArray(d)
        ? d.map((e) => e.msg).join(", ")
        : "Request failed"
    );
  }
  return data;
}

// Text for an error response's `detail` (a string, or a list of validation errors).
const detailText = (d) =>
  typeof d === "string" ? d : Array.isArray(d) ? d.map((e) => e.msg).join(", ") : "Request failed";

// Send a file as a multipart form. No Content-Type header: the browser adds it with the boundary.
export async function apiForm(path, form, method = "POST") {
  const token = getToken();
  const res = await fetch(API + path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (res.status === 401 && token) {
    clearToken();
    window.location.reload();
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(detailText(data?.detail));
  return data;
}

// Fetch a private file (a driver's photo or document) as a Blob. An <img src> or a plain link
// cannot send the login token, so the page fetches the file itself.
export async function fetchBlob(path) {
  const token = getToken();
  const res = await fetch(API + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(detailText(data?.detail) || "Could not load the file");
  }
  return res.blob();
}
