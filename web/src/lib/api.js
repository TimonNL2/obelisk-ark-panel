export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'X-ArkPanel': '1' };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Cannot reach the panel. Is it running?', 0);
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('arkpanel:unauthorized'));
  if (!res.ok) throw new ApiError((isJson && data?.error) || res.statusText || 'Request failed', res.status);
  return data;
}

export const get = (p) => api(p);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const put = (p, body = {}) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });

/** Upload files with progress (fetch has no upload progress). */
export function upload(url, files, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const f of files) form.append('file', f, f.relativePath || f.webkitRelativePath || f.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${url}`);
    xhr.setRequestHeader('X-ArkPanel', '1');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(data?.error || `Upload failed (${xhr.status})`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('Upload failed (network error)', 0));
    xhr.send(form);
  });
}

export const q = (params) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) s.set(k, v);
  return s.toString();
};
