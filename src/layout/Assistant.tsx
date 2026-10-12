import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUp, RotateCcw, Sparkles, X } from "lucide-react";
import type { Me } from "../api";
import { useI18n } from "../i18n";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

export function Assistant({ me }: { me: Me }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy, error]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Neues Konto oder Abmelden: Gespräch nicht mitnehmen.
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => setMessages([]), [me.user.id]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
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
      setMessages(messages);
      setDraft(text);
    };

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, lang }),
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
      setBusy(false);
      abortRef.current = null;
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError("");
    setDraft("");
    inputRef.current?.focus();
  };

  const firstName = me.user.name.split(" ")[0];
  const suggestions = [t("assistant.suggestion1"), t("assistant.suggestion2"), t("assistant.suggestion3")];

  return (
    <>
      <button className={open ? "assistant-fab hidden" : "assistant-fab"} onClick={() => setOpen(true)} aria-label={t("assistant.open")} title={t("assistant.open")}>
        <Sparkles size={22} />
      </button>

      {open && (
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

          <div className="assistant-body" ref={listRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="assistant-empty">
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
          </div>

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
        </section>
      )}
    </>
  );
}
