// Rechenformeln im Aufmaß, z. B. „4,5 x 3,2 - 0,9 * 2,1“ oder „(2+3) × 2,5“.
// Eigener kleiner Rechner statt Function()/eval: die verbieten die Sicherheitsregeln
// im Browser (CSP) und im Worker, das Aufmaß kam deshalb immer auf 0.

/** Ergebnis auf zwei Stellen gerundet, oder null bei ungültiger Formel. */
export function evaluateFormula(input: string): number | null {
  const text = input.replace(/,/g, ".").replace(/[x×·]/gi, "*").replace(/[÷:]/g, "/").replace(/\s+/g, "");
  if (!text || text.length > 200) return null;
  let pos = 0;

  const peek = () => text[pos];
  const number = (): number => {
    const match = /^\d+(\.\d+)?|^\.\d+/.exec(text.slice(pos));
    if (!match) throw new Error("number");
    pos += match[0].length;
    return Number(match[0]);
  };
  const factor = (): number => {
    if (peek() === "-") return pos++, -factor();
    if (peek() === "+") return pos++, factor();
    if (peek() === "(") {
      pos++;
      const value = sum();
      if (peek() !== ")") throw new Error("paren");
      pos++;
      return value;
    }
    return number();
  };
  const product = (): number => {
    let value = factor();
    while (peek() === "*" || peek() === "/") {
      const op = text[pos++];
      const right = factor();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const op = text[pos++];
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };

  try {
    const value = sum();
    if (pos !== text.length || !Number.isFinite(value)) return null;
    return Math.round(value * 100) / 100;
  } catch {
    return null;
  }
}
