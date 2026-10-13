import { useEffect, useState } from "react";
import { api, POS_REGISTER_KEY } from "../api";
import { MAIN_REGISTER, type PosRegister } from "../../shared/pos";

// Kassenplätze der Firma und der Platz, an dem dieses Gerät steht (im Browser gespeichert).

const CHANGED = "ck-pos-register-changed";
let cache: PosRegister[] | null = null;

export function deviceRegisterId(): string {
  try {
    return localStorage.getItem(POS_REGISTER_KEY) || MAIN_REGISTER.id;
  } catch {
    return MAIN_REGISTER.id;
  }
}

export function setDeviceRegister(id: string) {
  try {
    if (id === MAIN_REGISTER.id) localStorage.removeItem(POS_REGISTER_KEY);
    else localStorage.setItem(POS_REGISTER_KEY, id);
  } catch {
    // ohne Speicher bleibt das Gerät am Hauptplatz
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Alle Kassenplätze und der Platz dieses Geräts; neu laden nach Änderungen in den Einstellungen. */
export function useRegisters() {
  const [registers, setRegisters] = useState<PosRegister[]>(cache ?? [MAIN_REGISTER]);
  const [deviceId, setDeviceId] = useState(deviceRegisterId);

  const reload = () =>
    api<{ registers: PosRegister[] }>("/pos/registers")
      .then((d) => {
        cache = d.registers;
        setRegisters(d.registers);
        window.dispatchEvent(new Event(CHANGED));
      })
      .catch(() => {});

  useEffect(() => {
    if (!cache) reload();
    const onChange = () => {
      setDeviceId(deviceRegisterId());
      if (cache) setRegisters(cache);
    };
    window.addEventListener(CHANGED, onChange);
    return () => window.removeEventListener(CHANGED, onChange);
  }, []);

  const current = registers.find((r) => r.id === deviceId) ?? registers.find((r) => r.id === MAIN_REGISTER.id) ?? MAIN_REGISTER;
  return { registers, current, reload };
}

/** Name eines Kassenplatzes für Listen und Belege; leer, solange die Firma nur einen Platz hat. */
export function useRegisterLabel() {
  const { registers } = useRegisters();
  return (id?: string, stored?: string) => (registers.length > 1 && id ? registers.find((r) => r.id === id)?.name ?? stored ?? "" : "");
}
