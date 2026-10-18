/** One line of the on-screen log. */
export interface LogLine {
  text: string;
  error: boolean;
  /** Seconds since it was printed. */
  age: number;
}

/** Turns anything passed to `debug.log()` into one line of text. */
export function formatMessage(parts: unknown[]): string {
  return parts
    .map((p) => {
      if (typeof p === "string") return p;
      if (p instanceof Error) return p.stack ?? p.message;
      if (typeof p === "object" && p !== null) {
        try {
          return JSON.stringify(p);
        } catch {
          return String(p);
        }
      }
      return String(p);
    })
    .join(" ");
}

/**
 * The lines behind the on-screen log: newest last, capped, and expired after
 * `ttl` seconds. The last `fadeTime` seconds of a line fade it out.
 */
export class LogBuffer {
  readonly lines: LogLine[] = [];

  constructor(
    private readonly ttl = 4,
    private readonly fadeTime = 1,
    private readonly max = 8,
  ) {}

  /** Adds a line, dropping the oldest ones beyond the cap. */
  push(text: string, error = false) {
    this.lines.push({ text, error, age: 0 });
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
  }

  /** Ages the lines by `dt` real seconds and drops the expired ones. */
  tick(dt: number) {
    for (const line of this.lines) line.age += dt;
    // Older lines come first, so the expired ones are always a prefix.
    let n = 0;
    while (n < this.lines.length && this.lines[n].age >= this.ttl) n++;
    if (n > 0) this.lines.splice(0, n);
  }

  /** 1 while fresh, fading to 0 over the last `fadeTime` seconds. */
  opacity(line: LogLine) {
    return Math.min(1, Math.max(0, (this.ttl - line.age) / this.fadeTime));
  }

  /** Removes every line. */
  clear() {
    this.lines.length = 0;
  }
}
