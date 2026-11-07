import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** A password input with a show/hide button, in the sign-in style. */
export default function PasswordField({ id, value, onChange, autoComplete, placeholder, minLength }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder: string; minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className="auth__pw">
      <input id={id} className="input" type={show ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder}
        value={value} onChange={e => onChange(e.target.value)} minLength={minLength} required />
      <button type="button" className="auth__eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(s => !s)}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}
