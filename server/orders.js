// Shared helpers for order documents (orders/{sessionId}).
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/** One line of the order's email log: what was sent, to whom, and Resend's email id. */
export function emailEntry(type, to, subject, sent) {
  return { type, to, subject, resendId: (sent && sent.id) || null, status: sent ? 'sent' : 'skipped', sentAt: Timestamp.now() };
}

/** One line of the order's status history. */
export function historyEntry(status, by, extra = {}) {
  return { status, at: Timestamp.now(), by, ...extra };
}

export const push = entry => FieldValue.arrayUnion(entry);
