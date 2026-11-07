import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../src/firebase';
import { useAccount } from './account';

/** Their copy of a support conversation (accounts/{uid}/threads/{id}, written by server/sync.js). */
export interface MyThread {
  id: string;
  subject: string;
  topic: string;
  orderNumber: string;
  orderId: string | null;
  messages: { from: 'you' | 'axia'; body: string; at: number | null }[];
  lastAt: number | null;
  /** `replied`: the newest message is from the team. `open`: waiting on the team. */
  state: 'open' | 'replied';
  unread: boolean;
}

/** Same list as server/account.js SUPPORT_TOPICS. */
export const TOPICS = ['My order', 'Sizing', 'Care and repairs', 'Something else'];

/** All their conversations, newest activity first, live. */
export function useMyThreads() {
  const { user } = useAccount();
  const [threads, setThreads] = useState<MyThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'accounts', user.uid, 'threads'), s => {
      const list = s.docs.map(d => ({ ...(d.data() as Omit<MyThread, 'id'>), id: d.id }));
      list.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
      setThreads(list);
    }, e => setError(e.message));
  }, [user]);
  return { threads, error };
}

/** One conversation, live. `undefined` while loading, `null` if it isn't theirs. */
export function useMyThread(id: string) {
  const { user } = useAccount();
  const [thread, setThread] = useState<MyThread | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user || !id) return;
    return onSnapshot(doc(db, 'accounts', user.uid, 'threads', id),
      s => setThread(s.exists() ? { ...(s.data() as Omit<MyThread, 'id'>), id: s.id } : null),
      e => setError(e.message));
  }, [user, id]);
  return { thread, error };
}

/** "Today 3:04 pm", "Yesterday", "28 Oct". */
export function when(t: number | null, withTime = false) {
  if (!t) return '';
  const d = new Date(t);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  const date = days === 0 ? 'Today' : days === 1 ? 'Yesterday'
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
  return withTime ? `${date}, ${time}` : days === 0 ? time : date;
}
