import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Briefcase, Car, Scissors, ShoppingBag, ShoppingCart, Smartphone, UtensilsCrossed, Wrench } from "lucide-react";
import type { CatalogApp } from "../shared/apps";
import { navigate } from "./router";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="logo">
      <img src="/icon.svg" alt="" width={34} height={34} />
      {!compact && <span>Code Kontor</span>}
    </div>
  );
}

export function Field(props: { label: string; error?: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={props.wide ? "field wide" : "field"}>
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.error ? <small className="error">{props.error}</small> : props.hint && <small className="muted">{props.hint}</small>}
    </label>
  );
}

/** Interner Link, der ohne Neuladen der Seite wechselt. */
export function Link({ to, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        rest.onClick?.(e);
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}

const ICONS = {
  scissors: Scissors,
  wrench: Wrench,
  utensils: UtensilsCrossed,
  shopping: ShoppingBag,
  smartphone: Smartphone,
  car: Car,
  briefcase: Briefcase,
  register: ShoppingCart,
};

export function appStyle(app: CatalogApp): CSSProperties {
  return { "--hue": app.hue } as CSSProperties;
}

export function AppIcon({ app, size = "md" }: { app: CatalogApp; size?: "sm" | "md" | "lg" }) {
  const Icon = ICONS[app.icon];
  return (
    <span className={`app-icon ${size}`} style={appStyle(app)} aria-hidden>
      <Icon />
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return <span className="avatar">{initials || "?"}</span>;
}
