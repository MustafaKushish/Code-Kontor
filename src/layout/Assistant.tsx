import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Lightbulb, RotateCcw, Sparkles, ThumbsUp, X } from "lucide-react";
import type { Me } from "../api";
import { useI18n } from "../i18n";
import { Link } from "../components";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Fertige Vorschläge, die sofort erscheinen (ohne KI); darunter kann man weiter fragen. */
export interface AssistantTips {
  title: string;
  intro: string;
  tips: { tone: "warn" | "idea" | "good"; title: string; text: string }[];
  followUps: { label: string; question: string }[];
}

/** Andere Seiten öffnen den Assistenten mit einer Frage oder mit Vorschlägen, z. B. die Auswertung mit ihrem Zeitraum. */
export interface AskAssistantDetail {
  question?: string;
  insights?: { from: string; to: string };
  tips?: AssistantTips;
}

const TONE_ICONS = { warn: AlertTriangle, idea: Lightbulb, good: ThumbsUp };
/** So nah am Ende gilt man als „unten“; dann läuft die Antwort mit. */
const NEAR_BOTTOM = 80;
export const ASK_ASSISTANT_EVENT = "ck-ask-assistant";
export const askAssistant = (detail: AskAssistantDetail) => window.dispatchEvent(new CustomEvent<AskAssistantDetail>(ASK_ASSISTANT_EVENT, { detail }));

/** Vorschläge der aktuellen Seite: ein leeres oder neues Gespräch zeigt sie statt der allgemeinen Beispiele. */
export type AssistantContext = { tips: AssistantTips; insights: { from: string; to: string } } | null;
export const ASSISTANT_CONTEXT_EVENT = "ck-assistant-context";
let pageContext: AssistantContext = null;
export function setAssistantContext(detail: AssistantContext) {
  pageContext = detail;
  window.dispatchEvent(new CustomEvent<AssistantContext>(ASSISTANT_CONTEXT_EVENT, { detail }));
}

type StreamEvent = { type: "text"; text: string } | { type: "reset" } | { type: "done" } | { type: "error"; code: string };

/** Fett (**text**) und kursiv (*text*) innerhalb einer Zeile; einzelne Sternchen fallen weg. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part.replace(/\*\*?/g, "")}</Fragment>;
  });
}

/** Kleine, sichere Darstellung der Antwort: Absätze und Listen, kein HTML. */
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <>{blocks}</>;
}

export function Assistant({ me, ai }: { me: Me; ai: boolean }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Zeitraum der Auswertung, solange das Gespräch dazu läuft: jede Folgefrage bekommt die Zahlen mit
  const [insights, setInsights] = useState<AskAssistantDetail["insights"]>();
  const [tips, setTips] = useState<AssistantTips>();
  const tipsRef = useRef(tips);
  tipsRef.current = tips;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Mitlaufen nur, solange man unten ist; wer hochscrollt, um zu lesen, wird nicht wieder nach unten gezogen.
  const stickRef = useRef(true);
  const lastTopRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);

  const toBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    // Nur echtes Hochscrollen löst das Mitlaufen; wachsender Text allein nicht.
    if (near) stickRef.current = true;
    else if (el.scrollTop < lastTopRef.current - 2) stickRef.current = false;
    lastTopRef.current = el.scrollTop;
    setAtBottom(near);
  };

  useEffect(() => {
    if (stickRef.current) toBottom();
    onScroll();
  }, [messages, busy, error]);

  useEffect(() => {
    if (!open) return;
    // Am Handy würde die Tastatur die Vorschläge verdecken
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    requestAnimationFrame(() => !(touch && tipsRef.current) && inputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Neues Konto oder Abmelden: Gespräch nicht mitnehmen.
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    setMessages([]);
    setInsights(pageContext?.insights);
    setTips(pageContext?.tips);
  }, [me.user.id]);

  const ask = async (question: string, fresh?: { insights?: AskAssistantDetail["insights"] }) => {
    const text = question.trim();
    if (!text || (busy && !fresh)) return;
    const before = fresh ? [] : messages;
    const range = fresh ? fresh.insights : insights;
    if (fresh) {
      abortRef.current?.abort();
      setInsights(fresh.insights);
      setTips(undefined);
    }
    stickRef.current = true;
    const history: ChatMessage[] = [...before, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setError("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let answer = "";
    const show = (content: string) =>
      setMessages((list) => [...list.slice(0, -1), { role: "assistant", content }]);
    const failWith = (code: string) => {
      setError(t(code === "noConnection" ? "common.noConnection" : `errors.${code}`));
      // Frage ohne Antwort aus dem Verlauf nehmen, damit sie neu gestellt werden kann.
      setMessages(before);
      setDraft(text);
    };

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, lang, ...(range ? { insights: range } : {}) }),
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { code?: string };
        return failWith(data.code ?? "assistantFailed");
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "text") show((answer += event.text));
          else if (event.type === "reset") show((answer = ""));
          else if (event.type === "error") return failWith(event.code);
        }
      }
      if (!answer.trim()) failWith("assistantFailed");
    } catch (err) {
      if ((err as Error).name !== "AbortError") failWith("noConnection");
    } finally {
      if (abortRef.current === controller) {
        setBusy(false);
        abortRef.current = null;
      }
    }
  };

  const aiRef = useRef(ai);
  aiRef.current = ai;
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => {
    const onAsk = (e: Event) => {
      const { question, insights: range, tips: list } = (e as CustomEvent<AskAssistantDetail>).detail;
      if (!list && !aiRef.current) return;
      setOpen(true);
      if (list) {
        // Vorschläge sofort zeigen, die KI erst auf Nachfrage
        abortRef.current?.abort();
        abortRef.current = null;
        setBusy(false);
        setMessages([]);
        setError("");
        setInsights(range);
        setTips(list);
        stickRef.current = false;
        requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0 }));
      } else if (question && aiRef.current) askRef.current(question, { insights: range });
    };
    // Seite wechselt ihre Vorschläge: ohne laufendes Gespräch gleich übernehmen
    const onContext = (e: Event) => {
      const context = (e as CustomEvent<AssistantContext>).detail;
      if (messagesRef.current.length) return;
      setTips(context?.tips);
      setInsights(context?.insights);
    };
    window.addEventListener(ASK_ASSISTANT_EVENT, onAsk);
    window.addEventListener(ASSISTANT_CONTEXT_EVENT, onContext);
    return () => {
      window.removeEventListener(ASK_ASSISTANT_EVENT, onAsk);
      window.removeEventListener(ASSISTANT_CONTEXT_EVENT, onContext);
    };
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    // Zurück zu den Vorschlägen der Seite, sonst zu den allgemeinen Beispielen
    setInsights(pageContext?.insights);
    setTips(pageContext?.tips);
    setError("");
    setDraft("");
    stickRef.current = false;
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0 }));
    inputRef.current?.focus();
  };

  const firstName = me.user.name.split(" ")[0];
  const suggestions = [t("assistant.suggestion1"), t("assistant.suggestion2"), t("assistant.suggestion3")];

  return (
    <>
      {ai && <button className={open ? "assistant-fab hidden" : "assistant-fab"} onClick={() => setOpen(true)} aria-label={t("assistant.open")} title={t("assistant.open")}>
        <Sparkles size={22} />
      </button>}

      {open && (ai || tips) && (
        <section className="assistant" role="dialog" aria-label={t("assistant.title")}>
          <header className="assistant-head">
            <span className="assistant-mark" aria-hidden><Sparkles size={18} /></span>
            <div>
              <strong>{t("assistant.title")}</strong>
              <small>{t("assistant.subtitle")}</small>
            </div>
            {messages.length > 0 && (
              <button className="assistant-tool" onClick={reset} aria-label={t("assistant.newChat")} title={t("assistant.newChat")}>
                <RotateCcw size={18} />
              </button>
            )}
            <button className="assistant-tool assistant-close" onClick={() => setOpen(false)} aria-label={t("assistant.close")} title={t("assistant.close")}>
              <X size={20} strokeWidth={2.4} />
            </button>
          </header>

          <div className="assistant-body" ref={listRef} onScroll={onScroll} aria-live="polite">
            {tips && (
              <div className="assistant-tips">
                <div className="assistant-tips-head">
                  <strong className="display">{tips.title}</strong>
                  <small>{tips.intro}</small>
                </div>
                {tips.tips.map((tip, i) => {
                  const Icon = TONE_ICONS[tip.tone];
                  return (
                    <article key={i} className={`assistant-tip ${tip.tone}`}>
                      <span className="assistant-tip-icon" aria-hidden><Icon size={16} /></span>
                      <div>
                        <strong>{tip.title}</strong>
                        <p>{tip.text}</p>
                      </div>
                    </article>
                  );
                })}
                {ai && messages.length === 0 && (
                  <div className="assistant-suggestions">
                    {tips.followUps.map((f) => (
                      <button key={f.label} onClick={() => ask(f.question)}>
                        <Sparkles size={15} /> {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {messages.length === 0 ? (
              !tips && <div className="assistant-empty">
                <p className="display">{t("overview.hello")}{lang === "ar" ? "،" : ","} {firstName}.</p>
                <div className="assistant-suggestions">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => ask(s)}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) =>
                m.role === "assistant" ? (
                  <div key={i} className={busy && i === messages.length - 1 ? "msg bot streaming" : "msg bot"}>
                    <span className="msg-avatar" aria-hidden><Sparkles size={14} /></span>
                    <div className="msg-text">
                      {m.content ? <RichText text={m.content} /> : <span className="typing" aria-label={t("assistant.thinking")}><i /><i /><i /></span>}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="msg user">{m.content}</div>
                ),
              )
            )}
            {error && <p className="assistant-error" role="alert">{error}</p>}
            {!atBottom && (
              <button className="assistant-down" onClick={() => { stickRef.current = true; toBottom(); }} aria-label={t("assistant.scrollDown")} title={t("assistant.scrollDown")}>
                <ArrowDown size={18} />
              </button>
            )}
          </div>

          {ai ? (
          <>
          <form className="assistant-input" onSubmit={submit}>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={4000}
              placeholder={t("assistant.placeholder")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
            />
            <button className="assistant-send" disabled={busy || !draft.trim()} aria-label={t("assistant.send")} title={t("assistant.send")}>
              <ArrowUp size={18} />
            </button>
          </form>
          <p className="assistant-note">{t("assistant.disclaimer")}</p>
          </>
          ) : (
            <div className="assistant-off">
              <p>{t("assistant.aiOff", { place: `${t("nav.company")} → ${t("settings.privacyTitle")}` })}</p>
              {me.user.role !== "staff" && (
                <Link to="/einstellungen" className="button" onClick={() => setOpen(false)}>{t("assistant.aiOffLink")}</Link>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
