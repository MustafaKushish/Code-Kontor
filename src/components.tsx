import type { ReactNode } from "react";

export function Logo() {
  return (
    <div className="logo">
      <img src="/icon.svg" alt="" width={32} height={32} />
      <span>Code Kontor</span>
    </div>
  );
}

export function Field(props: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={props.wide ? "wide" : undefined}>
      {props.label}
      {props.children}
      {props.error ? <small className="error">{props.error}</small> : props.hint && <small className="muted">{props.hint}</small>}
    </label>
  );
}
