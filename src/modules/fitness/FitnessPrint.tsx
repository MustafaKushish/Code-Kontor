import { Printer, X, Dumbbell, ShieldCheck, QrCode, CheckCircle2 } from "lucide-react";
import type { FitnessMember, FitnessPlan } from "../../../shared/fitness";

interface FitnessPrintProps {
  member: FitnessMember;
  plan?: FitnessPlan;
  companyName?: string;
  type: "contract" | "card";
  onClose: () => void;
}

export function FitnessPrint({
  member,
  plan,
  companyName = "Code Kontor Fitness & Athletics",
  type,
  onClose,
}: FitnessPrintProps) {
  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white text-zinc-900 rounded-2xl max-w-4xl w-full p-8 shadow-2xl relative max-h-[92vh] overflow-y-auto print:p-0 print:shadow-none print:max-h-none print:w-full print:rounded-none">
        {/* Toolbar - Screen only */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-zinc-200 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
              <Dumbbell className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900">
                {type === "contract" ? "Mitgliedsvertrag & SEPA-Mandat" : "Mitgliedsausweis (Druckansicht)"}
              </h2>
              <p className="text-sm text-zinc-500">
                {member.firstName} {member.lastName} · {member.memberNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Drucken
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors cursor-pointer"
              title="Schließen"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* --- DOKUMENT-INHALT --- */}
        {type === "contract" ? (
          <div className="space-y-6 text-sm text-zinc-800 font-sans print:text-xs">
            {/* Briefkopf */}
            <div className="flex justify-between items-start border-b border-zinc-300 pb-4">
              <div>
                <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-xl tracking-tight">
                  <Dumbbell className="w-6 h-6 text-emerald-600" />
                  <span>{companyName}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Sport- & Fitnesszentrum · Premium Training & Health Club · Deutschland
                </p>
              </div>
              <div className="text-right text-xs text-zinc-500">
                <p className="font-semibold text-zinc-800">Mitglieds-Nr.: {member.memberNumber}</p>
                <p>Vertragsbeginn: {member.joinDate}</p>
                <p>Ausstellungsdatum: {new Date().toLocaleDateString("de-DE")}</p>
              </div>
            </div>

            <div className="text-center py-2">
              <h1 className="text-xl font-bold uppercase tracking-wide text-zinc-900">
                Mitgliedschaftsvereinbarung
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                gemäß den allgemeinen Studio-Geschäftsbedingungen und Hausordnung
              </p>
            </div>

            {/* Vertragspartner & Mitgliedsdaten */}
            <div className="grid grid-cols-2 gap-6 bg-zinc-50 p-4 rounded-xl border border-zinc-200">
              <div>
                <h3 className="text-xs font-bold uppercase text-zinc-400 tracking-wider mb-2">
                  1. Mitgliedsdaten
                </h3>
                <div className="space-y-1">
                  <p className="font-bold text-base text-zinc-900">
                    {member.firstName} {member.lastName}
                  </p>
                  <p>Geburtsdatum: {member.birthDate || "–"}</p>
                  <p>E-Mail: {member.email}</p>
                  <p>Telefon: {member.phone || "–"}</p>
                  {member.emergencyContact && (
                    <p className="text-xs text-zinc-500 mt-1">
                      <span className="font-semibold">Notfallkontakt:</span> {member.emergencyContact}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-zinc-400 tracking-wider mb-2">
                  2. Gewählter Tarif & Konditionen
                </h3>
                <div className="space-y-1">
                  <p className="font-bold text-base text-emerald-800">{member.planName}</p>
                  <p className="flex justify-between">
                    <span>Monatlicher Beitrag:</span>
                    <span className="font-bold">{fmtEuro(member.monthlyFee)}</span>
                  </p>
                  {plan?.admissionFee ? (
                    <p className="flex justify-between text-xs text-zinc-500">
                      <span>Einmalige Aufnahmegebühr:</span>
                      <span>{fmtEuro(plan.admissionFee)}</span>
                    </p>
                  ) : null}
                  <p className="flex justify-between text-xs text-zinc-500">
                    <span>Mindestvertragslaufzeit:</span>
                    <span>{plan?.durationMonths || 12} Monate</span>
                  </p>
                  <p className="flex justify-between text-xs text-zinc-500">
                    <span>Gültig bis:</span>
                    <span>{member.validUntil || "Unbefristet"}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Inklusivleistungen */}
            <div>
              <h3 className="text-xs font-bold uppercase text-zinc-400 tracking-wider mb-2">
                3. Vereinbarte Inklusivleistungen
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-medium">Cardio- & Kraftbereich</span>
                </div>
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 flex items-center gap-2">
                  <CheckCircle2 className={`w-4 h-4 ${plan?.includesCourses ? "text-emerald-600" : "text-zinc-300"}`} />
                  <span className="text-xs font-medium">Gruppenkurse & Yoga</span>
                </div>
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 flex items-center gap-2">
                  <CheckCircle2 className={`w-4 h-4 ${plan?.includesSauna ? "text-emerald-600" : "text-zinc-300"}`} />
                  <span className="text-xs font-medium">Sauna & Wellness</span>
                </div>
              </div>
            </div>

            {/* SEPA-Lastschriftmandat */}
            <div className="border border-zinc-300 rounded-xl p-4 bg-zinc-50/50">
              <h3 className="text-xs font-bold uppercase text-zinc-700 tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                4. SEPA-Lastschriftmandat für wiederkehrende Zahlungen
              </h3>
              <p className="text-xs text-zinc-600 mb-3 leading-relaxed">
                Ich ermächtige {companyName}, Zahlungen von meinem Konto mittels Lastschrift einzuziehen.
                Zugleich weise ich mein Kreditinstitut an, die von {companyName} auf mein Konto gezogenen Lastschriften einzulösen.
              </p>
              <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-white p-3 rounded-lg border border-zinc-200">
                <div>
                  <span className="text-zinc-400 block font-sans">IBAN des Mitglieds:</span>
                  <span className="font-bold text-zinc-900">{member.iban || "DE__ ____ ____ ____ ____ __"}</span>
                </div>
                <div>
                  <span className="text-zinc-400 block font-sans">Gläubiger-Identifikationsnummer / Mandat:</span>
                  <span className="font-bold text-zinc-900">DE98ZZZ00002148911 / {member.memberNumber}</span>
                </div>
              </div>
            </div>

            {/* Hausordnung & Auszüge */}
            <div className="text-[11px] text-zinc-500 space-y-1.5 leading-normal">
              <p className="font-semibold text-zinc-700">Auszug aus der Hausordnung:</p>
              <p>
                § 1 Der Zutritt ist nur mit gültigem Mitgliedsausweis oder Check-In per QR-Code / Thekenscan gestattet.
                Bei Verlust des Ausweises ist das Studio unverzüglich zu benachrichtigen.
              </p>
              <p>
                § 2 Aus hygienischen Gründen ist im gesamten Trainingsbereich das Tragen sauberer Sportschuhe und die Benutzung eines Handtuchs Pflicht.
              </p>
              <p>
                § 3 Die Kündigung bedarf der Textform und ist mit einer Frist von einem Monat zum Ende der regulären Vertragslaufzeit einzureichen.
              </p>
            </div>

            {/* Unterschriftenblock */}
            <div className="pt-8 grid grid-cols-2 gap-12 text-xs">
              <div className="border-t border-zinc-400 pt-2">
                <p className="font-bold text-zinc-800">Ort, Datum</p>
                <p className="text-zinc-400 mt-1">Unterschrift des Studioleiters / Vertreters</p>
              </div>
              <div className="border-t border-zinc-400 pt-2">
                <p className="font-bold text-zinc-800">Ort, Datum</p>
                <p className="text-zinc-400 mt-1">Unterschrift des Mitglieds (bei Minderjährigen Erziehungsberechtigter)</p>
              </div>
            </div>
          </div>
        ) : (
          /* --- MITGLIEDSAUSWEIS --- */
          <div className="space-y-8 py-4">
            <div className="text-center">
              <h3 className="text-lg font-bold text-zinc-900">Mitgliedsausweis & Theken-Barcode</h3>
              <p className="text-xs text-zinc-500 mt-1">
                Kann als Scheckkarte oder Anhänger ausgedruckt werden. Unterstützt alle Barcode- und QR-Scanner am Empfangstresen.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              {/* Vorderseite Ausweis */}
              <div className="w-80 h-48 bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-950 text-white rounded-2xl p-5 shadow-xl flex flex-col justify-between border border-zinc-700 relative overflow-hidden">
                <div className="absolute -right-8 -bottom-8 opacity-10 text-white pointer-events-none">
                  <Dumbbell className="w-40 h-40" />
                </div>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm tracking-wider uppercase">
                      <Dumbbell className="w-4 h-4" />
                      <span>{companyName}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-widest block mt-0.5">
                      Member Pass
                    </span>
                  </div>
                  <div className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">
                    {member.status.toUpperCase()}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wider">Mitglied</p>
                  <p className="text-lg font-bold tracking-tight text-white">
                    {member.firstName} {member.lastName}
                  </p>
                  <p className="text-xs text-emerald-400 font-medium">{member.planName}</p>
                </div>

                <div className="flex justify-between items-end border-t border-zinc-800 pt-2 text-[10px] text-zinc-400">
                  <div>
                    <span>Gültig ab: {member.joinDate}</span>
                  </div>
                  <div className="font-mono font-bold text-white text-xs">
                    {member.memberNumber}
                  </div>
                </div>
              </div>

              {/* Rückseite Ausweis mit Barcode & QR */}
              <div className="w-80 h-48 bg-white text-zinc-900 rounded-2xl p-5 shadow-xl flex flex-col justify-between border border-zinc-300 relative">
                <div className="flex justify-between items-center border-b border-zinc-200 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Theken-Check-In
                  </span>
                  <span className="text-[10px] text-zinc-400">Notfall: {member.emergencyContact || "112"}</span>
                </div>

                {/* Strichcode-Simulation */}
                <div className="my-auto text-center flex flex-col items-center">
                  <div className="flex items-center justify-center gap-1 h-14 w-full px-4 py-1 bg-zinc-50 border border-zinc-200 rounded-lg">
                    {/* Linienmuster für Barcode */}
                    {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 4, 1, 3, 2, 4, 1, 2, 3, 2, 4, 1].map((w, i) => (
                      <div
                        key={i}
                        className="bg-black h-10"
                        style={{ width: `${w * 2}px` }}
                      />
                    ))}
                  </div>
                  <p className="font-mono font-bold text-sm tracking-widest text-zinc-800 mt-1">
                    *{member.memberNumber}*
                  </p>
                </div>

                <div className="flex justify-between items-center text-[9px] text-zinc-400 border-t border-zinc-200 pt-1.5">
                  <span>Bei Auffinden bitte im Studio abgeben.</span>
                  <QrCode className="w-4 h-4 text-zinc-600" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
