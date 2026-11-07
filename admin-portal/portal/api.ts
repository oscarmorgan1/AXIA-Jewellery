import { auth } from '../src/firebase';

/**
 * Calls the AXIA server's account API (/api/account/*). Sends the signed-in
 * customer's ID token when there is one. Throws with the server's message.
 */
export async function accountApi<T = unknown>(path: string, body: unknown = {}): Promise<T> {
  const user = auth.currentUser;
  const res = await fetch(`/api/account${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error || `Request failed (${res.status})`), { status: res.status });
  return data as T;
}
