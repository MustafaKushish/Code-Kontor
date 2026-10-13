import { formatRate } from "../money";
import type { CashMove, Closing, PosLine, Receipt } from "../../shared/pos";
import { usePosI18n } from "./i18n";
import { CompanyFoot, CompanyHead, PrintFrame } from "./ui";
import { usePosSettings } from "./PayPanel";

/** Bezeichnung einer Position; Anzahlungen werden in der Sprache des Betrachters benannt. */
export function useLineName() {
  const { p } = usePosI18n();
  return (l: PosLine) => (l.kind === "deposit" ? p("print.depositLine", { label: l.name }) : l.name);
}

function titleOf(receipt: Receipt, p: (k: string) => string) {
  return receipt.kind === "cancel" ? p("print.cancel") : receipt.kind === "deposit" ? p("print.deposit") : p("print.invoice");
}

/** Beleg drucken: A4-Rechnung oder Bon (80 mm). */
export function ReceiptPrint({ receipt, format, onClose }: { receipt: Receipt; format: "a4" | "bon"; onClose: () => void }) {
  return (
    <PrintFrame format={format} onClose={onClose}>
      {format === "a4" ? <A4 receipt={receipt} /> : <Bon receipt={receipt} />}
    </PrintFrame>
  );
}

function Totals({ receipt }: { receipt: Receipt }) {
  const { p, money, lang } = usePosI18n();
  const m = (c: number) => money(c, receipt.currency);
  const showVat = !receipt.smallBusiness && receipt.totals.vat.some((v) => v.rate > 0);
  return (
    <>
      {showVat && <p><span>{p("print.net")}</span><span>{m(receipt.totals.netCents)}</span></p>}
      {showVat && receipt.totals.vat.filter((v) => v.rate > 0).map((v) => (
        <p key={v.rate}><span>{p("print.vat", { rate: formatRate(v.rate, lang).replace(" %", "") })}</span><span>{m(v.vatCents)}</span></p>
      ))}
      <p className="grand"><span>{p("print.sum")}</span><strong>{m(receipt.totals.grossCents)}</strong></p>
      {receipt.depositCents !== 0 && (
        <>
          <p><span>{p("print.depositPaid")}</span><span>{m(-receipt.depositCents)}</span></p>
          <p className="grand"><span>{p("print.toPay")}</span><strong>{m(receipt.dueCents)}</strong></p>
        </>
      )}
      {receipt.payments.map((pay) => (
        <p key={pay.method}><span>{p("print.paid")} · {p(`methods.${pay.method}`)}</span><span>{m(pay.cents)}</span></p>
      ))}
      {receipt.changeCents > 0 && (
        <>
          <p><span>{p("print.given")}</span><span>{m(receipt.givenCents)}</span></p>
          <p><span>{p("print.change")}</span><span>{m(receipt.changeCents)}</span></p>
        </>
      )}
    </>
  );
}

function Notes({ receipt }: { receipt: Receipt }) {
  const { p } = usePosI18n();
  return (
    <>
      {receipt.cancels && <p>{p("print.cancels", { number: receipt.cancels })}</p>}
      {receipt.smallBusiness && <p>{p("print.smallBusiness")}</p>}
      {!receipt.smallBusiness && receipt.lines.some((l) => l.margin) && <p>{p("print.margin")}</p>}
    </>
  );
}

function A4({ receipt }: { receipt: Receipt }) {
  const { p, money, day, lang } = usePosI18n();
  const name = useLineName();
  const m = (c: number) => money(c, receipt.currency);
  const c = receipt.customer;
  return (
    <>
      <CompanyHead
        company={receipt.company}
        title={titleOf(receipt, p)}
        meta={<><p><strong>{receipt.number}</strong></p><p>{p("print.date")}: {day(receipt.issuedAt)}</p></>}
      />
      {c && (c.name || c.address) && (
        <section>
          <h2>{p("print.customer")}</h2>
          <p className="pre">{[c.name, c.address, c.phone, c.email].filter(Boolean).join("\n")}</p>
        </section>
      )}
      <table className="print-table">
        <thead>
          <tr><th>{p("print.pos")}</th><th>{p("print.description")}</th><th className="num">{p("print.qty")}</th><th className="num">{p("print.unit")}</th><th className="num">{p("print.amount")}</th></tr>
        </thead>
        <tbody>
          {receipt.lines.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                {name(l)}
                {l.margin ? <small> ({p("print.marginShort")})</small> : !receipt.smallBusiness && <small> ({formatRate(l.vatRate, lang)})</small>}
                {l.warrantyUntil && <><br /><small>{p("print.warranty", { day: day(l.warrantyUntil) })}</small></>}
              </td>
              <td className="num">{l.qty.toLocaleString(lang)}</td>
              <td className="num">{m(l.unitCents)}</td>
              <td className="num">{m(Math.round(l.qty * l.unitCents))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="print-totals"><Totals receipt={receipt} /></div>
      <Notes receipt={receipt} />
      {receipt.kind === "sale" && <p>{p("print.serviceDate")}</p>}
      {receipt.cashier && <p className="muted">{p("print.cashier", { name: receipt.cashier })}</p>}
      <CompanyFoot company={receipt.company} />
    </>
  );
}

function Bon({ receipt }: { receipt: Receipt }) {
  const { p, money, dateTime, lang } = usePosI18n();
  const [settings] = usePosSettings();
  const name = useLineName();
  const m = (c: number) => money(c, receipt.currency);
  const co = receipt.company;
  return (
    <div className="bon">
      <header className="bon-head">
        {co.logoDataUrl && <img src={co.logoDataUrl} alt="" />}
        <strong>{co.name}</strong>
        <span>{co.street}</span>
        <span>{co.postalCode} {co.city}</span>
        {co.phone && <span>{co.phone}</span>}
        {(co.vatId || co.taxNumber) && <span>{co.vatId ? `${p("print.vatId")} ${co.vatId}` : `${p("print.taxNumber")} ${co.taxNumber}`}</span>}
      </header>
      <p className="bon-title">{titleOf(receipt, p)} {receipt.number}<br />{dateTime(receipt.issuedAt)}</p>
      <div className="bon-lines">
        {receipt.lines.map((l, i) => (
          <div key={i}>
            <p><span>{name(l)}</span><span>{m(Math.round(l.qty * l.unitCents))}</span></p>
            {(l.qty !== 1 || l.margin || !receipt.smallBusiness) && (
              <small>
                {l.qty !== 1 ? `${l.qty.toLocaleString(lang)} × ${m(l.unitCents)} ` : ""}
                {l.margin ? p("print.marginShort") : !receipt.smallBusiness ? formatRate(l.vatRate, lang) : ""}
              </small>
            )}
          </div>
        ))}
      </div>
      <div className="bon-totals"><Totals receipt={receipt} /></div>
      <div className="bon-notes">
        <Notes receipt={receipt} />
        {receipt.cashier && <p>{p("print.cashier", { name: receipt.cashier })}</p>}
        <p className="bon-thanks">{p("print.thanks")}</p>
        {settings?.footer && <p className="pre-line">{settings.footer}</p>}
      </div>
    </div>
  );
}

/** Z-Bericht eines Tagesabschlusses (A4). */
export function ClosingPrint({ closing, moves, company, onClose }: { closing: Closing; moves: CashMove[]; company: Receipt["company"] | null; onClose: () => void }) {
  const { p, money, dateTime, lang } = usePosI18n();
  return (
    <PrintFrame format="a4" onClose={onClose}>
      {company && (
        <CompanyHead
          company={company}
          title={p("print.closingTitle", { n: closing.number })}
          meta={<p>{p("print.period")}: {closing.since ? dateTime(closing.since) : "–"} – {dateTime(closing.at)}</p>}
        />
      )}
      <table className="print-table">
        <tbody>
          <tr><td>{p("cashbook.sales")}</td><td className="num">{money(closing.salesCents)}</td></tr>
          <tr><td>{p("cashbook.receipts", { n: closing.receipts })} · {p("cashbook.cancels", { n: closing.cancels })}</td><td className="num" /></tr>
          {(Object.keys(closing.byMethod) as (keyof Closing["byMethod"])[]).filter((k) => closing.byMethod[k]).map((k) => (
            <tr key={k}><td>{p(`methods.${k}`)}</td><td className="num">{money(closing.byMethod[k])}</td></tr>
          ))}
        </tbody>
      </table>
      {closing.vat.length > 0 && (
        <table className="print-table">
          <thead><tr><th>{p("cashbook.vatTitle")}</th><th className="num">{p("print.net")}</th><th className="num">{p("print.vat", { rate: "" }).replace(" %", "")}</th><th className="num">{p("print.sum")}</th></tr></thead>
          <tbody>
            {closing.vat.map((v) => (
              <tr key={v.rate}><td>{formatRate(v.rate, lang)}</td><td className="num">{money(v.netCents)}</td><td className="num">{money(v.vatCents)}</td><td className="num">{money(v.netCents + v.vatCents)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <table className="print-table">
        <tbody>
          <tr><td>{p("cashbook.opening")}</td><td className="num">{money(closing.openingCents)}</td></tr>
          <tr><td>{p("cashbook.cashIn")}</td><td className="num">{money(closing.byMethod.cash)}</td></tr>
          <tr><td>{p("cashbook.moves")}</td><td className="num">{money(closing.movesCents)}</td></tr>
          <tr><td><strong>{p("cashbook.expected")}</strong></td><td className="num"><strong>{money(closing.expectedCents)}</strong></td></tr>
          <tr><td>{p("cashbook.counted")}</td><td className="num">{money(closing.countedCents)}</td></tr>
          <tr><td>{p("cashbook.difference")}</td><td className="num">{money(closing.differenceCents)}</td></tr>
          <tr><td>{p("cashbook.bank")}</td><td className="num">{money(closing.bankCents)}</td></tr>
          <tr><td>{p("cashbook.remains")}</td><td className="num">{money(closing.closingCents)}</td></tr>
        </tbody>
      </table>
      {moves.length > 0 && (
        <table className="print-table">
          <thead><tr><th>{p("cashbook.movesTitle")}</th><th>{p("cashbook.note")}</th><th className="num">{p("print.amount")}</th></tr></thead>
          <tbody>
            {moves.map((mv) => (
              <tr key={mv.id}>
                <td>{dateTime(mv.at)} · {p(`cashbook.kinds.${mv.kind}`)}{mv.method !== "cash" ? ` (${p(`methods.${mv.method}`)})` : ""}</td>
                <td>{[mv.ref, mv.note].filter(Boolean).join(" · ")}</td>
                <td className="num">{money(mv.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {closing.note && <p>{closing.note}</p>}
      <section className="print-sign">
        <div><span />{closing.userName}</div>
        <div><span />{p("print.signature")}</div>
      </section>
    </PrintFrame>
  );
}
