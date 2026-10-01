import { useCallback, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<number>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setMsg(null), 2800);
  }, []);
  const node = msg ? <div className="toast" role="status" key={msg}><CheckCircle2 size={16} />{msg}</div> : null;
  return { show, node };
}
