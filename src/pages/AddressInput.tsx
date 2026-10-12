import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { api } from "../api";

export interface AddressSuggestion {
  street: string;
  postalCode: string;
  city: string;
  country: string;
  label: string;
}

/** Straßenfeld mit Vorschlägen: beim Tippen erscheinen passende Adressen, ein Klick füllt PLZ, Ort und Land. */
export function AddressInput(props: {
  value: string;
  country: string;
  lang: string;
  onChange: (value: string) => void;
  onPick: (suggestion: AddressSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = props.value.trim();
    if (!typed.current || q.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q, country: props.country, lang: props.lang });
      api<{ suggestions: AddressSuggestion[] }>(`/geo/address?${params}`)
        .then((r) => {
          if (cancelled) return;
          setSuggestions(r.suggestions);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => !cancelled && setSuggestions([]));
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [props.value, props.country, props.lang]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const pick = (s: AddressSuggestion) => {
    typed.current = false;
    props.onPick(s);
    setOpen(false);
    setSuggestions([]);
  };

  const show = open && suggestions.length > 0;
  return (
    <div className="address" ref={box}>
      <input
        value={props.value}
        autoComplete="street-address"
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        aria-controls="address-list"
        aria-activedescendant={active >= 0 ? `address-${active}` : undefined}
        onChange={(e) => {
          typed.current = true;
          props.onChange(e.target.value);
        }}
        onFocus={() => suggestions.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
          if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(suggestions[active]!); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {show && (
        <ul className="address-list" id="address-list" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.label + s.country}
              id={`address-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              onMouseEnter={() => setActive(i)}
            >
              <MapPin size={16} aria-hidden />
              <span>
                <strong>{s.street}</strong>
                <small>{`${s.postalCode} ${s.city}`.trim()}{s.country && s.country !== props.country ? ` · ${s.country}` : ""}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
