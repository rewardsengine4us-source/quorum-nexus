// A minimal Chrome DevTools Protocol client, written against Deno's native
// WebSocket.
//
// Why not Puppeteer: this runs in Supabase's Deno edge runtime, where
// Puppeteer's Node dependencies are a liability rather than a convenience.
// Everything live sync needs is a handful of CDP domains — navigate,
// evaluate, type, screenshot — so a small purpose-built client is less
// code and far less to go wrong than shimming Node into Deno.

export interface CdpOptions {
  /** Browserless token. */
  token: string;
  host?: string;
  /** How long Browserless should keep the session alive, ms. */
  sessionTimeoutMs?: number;
}

type Pending = {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
};

export class Cdp {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private closed = false;
  /** Set once we attach to a page target; scopes page-level commands. */
  sessionId: string | null = null;

  private constructor(ws: WebSocket) {
    this.ws = ws;

    this.ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(`${msg.error.message ?? "CDP error"}`));
        } else {
          p.resolve(msg.result ?? {});
        }
      }
      // Events are ignored on purpose. Waiting on Page.loadEventFired is
      // unreliable across single-page apps that never fire it again after
      // the first render, so readiness is polled from the page instead.
    };

    this.ws.onclose = () => {
      this.closed = true;
      for (const [, p] of this.pending) {
        p.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    };
  }

  /**
   * Ask the service, over plain HTTP, why it is unhappy.
   *
   * A rejected WebSocket upgrade surfaces in Deno as an `error` event with
   * no status and no body, so a failed connect is indistinguishable from a
   * bad key, an unsupported query parameter, or a plan limit. This endpoint
   * answers with a readable status and message, which is the difference
   * between a fix and another guess.
   */
  private static async diagnose(
    host: string,
    token: string
  ): Promise<string> {
    try {
      const res = await fetch(
        `https://${host}/json/version?token=${encodeURIComponent(token)}`,
        { method: "GET" }
      );
      const body = (await res.text()).slice(0, 300);
      if (res.ok) {
        // The token is fine and the service is up, so the upgrade itself
        // was refused — almost always a query parameter this plan rejects.
        return `the service is reachable and the key is valid (HTTP ${res.status}), so the connection options were refused. Response: ${body}`;
      }
      return `HTTP ${res.status} from the browser service: ${body}`;
    } catch (e) {
      return `the browser service could not be reached at all: ${(e as Error).message}`;
    }
  }

  /** One attempt at one URL. */
  private static attempt(url: string, timeoutMs: number): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch { /* already closing */ }
        reject(new Error("timed out"));
      }, timeoutMs);

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new Cdp(ws));
      };

      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error("upgrade refused"));
      };
    });
  }

  /**
   * Connect, trying the fullest set of options first and falling back to
   * the barest one.
   *
   * Browserless plan-gates query parameters, and a parameter this plan does
   * not allow gets the entire upgrade refused rather than ignored — we
   * already found `Browserless.reconnect` capped at 10s the same way. Since
   * a failed upgrade tells Deno nothing, trying the plain `?token=` form
   * before giving up costs one round trip and turns a hard failure into a
   * working session on the plan's default limits.
   */
  static async connect(
    opts: CdpOptions,
    connectTimeoutMs = 25000
  ): Promise<Cdp> {
    const host = opts.host ?? "production-sfo.browserless.io";
    const token = encodeURIComponent(opts.token);

    const candidates = [
      `wss://${host}?token=${token}&timeout=${opts.sessionTimeoutMs ?? 180000}`,
      `wss://${host}?token=${token}`,
    ];

    for (const url of candidates) {
      try {
        return await Cdp.attempt(url, connectTimeoutMs);
      } catch {
        // Try the next, simpler form.
      }
    }

    const why = await Cdp.diagnose(host, opts.token);
    throw new Error(`Browser service refused the connection — ${why}`);
  }

  send(method: string, params: any = {}, useSession = true): Promise<any> {
    if (this.closed) return Promise.reject(new Error("CDP socket closed"));

    const id = this.nextId++;
    const payload: any = { id, method, params };
    if (useSession && this.sessionId) payload.sessionId = this.sessionId;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (e) {
        this.pending.delete(id);
        reject(e as Error);
      }
    });
  }

  /** Open a tab and scope this client to it. */
  async openPage(): Promise<void> {
    const { targetId } = await this.send(
      "Target.createTarget",
      { url: "about:blank" },
      false
    );
    const { sessionId } = await this.send(
      "Target.attachToTarget",
      { targetId, flatten: true },
      false
    );
    this.sessionId = sessionId;

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    // A phone-sized viewport, because the screenshots go to a user who is
    // most likely holding one.
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: 430,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  /** Evaluate an expression in the page and return its JSON value. */
  async evaluate(expression: string): Promise<any> {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      // Some sites define globals that throw on access during teardown;
      // this keeps one bad getter from failing the whole sync.
      silent: false,
    });
    if (res.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description ??
          res.exceptionDetails.text ??
          "Page script error"
      );
    }
    return res.result?.value;
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
  }

  /**
   * Wait until the document is interactive and has actually rendered
   * something. `readyState` alone is a poor signal on SPA shells, which
   * report complete while the body is still a spinner.
   */
  async waitForReady(timeoutMs = 25000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const ok = await this.evaluate(`
          (function () {
            if (document.readyState === "loading") return false;
            var b = document.body;
            return !!b && b.innerText.trim().length > 40;
          })()
        `);
        if (ok) {
          // Give late-hydrating widgets a moment to attach their fields.
          await sleep(1200);
          return;
        }
      } catch {
        // Mid-navigation the context is destroyed; that is expected.
      }
      await sleep(400);
    }
  }

  async focus(selector: string): Promise<boolean> {
    return !!(await this.evaluate(`
      (function () {
        var el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.focus();
        return document.activeElement === el;
      })()
    `));
  }

  /**
   * Type into the focused element.
   *
   * Input.insertText produces the same events the renderer emits for real
   * typing, which is what React's synthetic onChange is listening for.
   * Assigning `.value` from a script does not, and controlled inputs
   * silently revert — hence the verify-and-fall-back below rather than
   * trusting either method blindly.
   */
  async typeInto(selector: string, text: string): Promise<boolean> {
    if (!(await this.focus(selector))) return false;

    await this.evaluate(`
      (function () {
        var el = document.querySelector(${JSON.stringify(selector)});
        if (el) { el.value = ""; }
      })()
    `);
    await this.focus(selector);
    await this.send("Input.insertText", { text });
    await sleep(120);

    const got = await this.evaluate(`
      (function () {
        var el = document.querySelector(${JSON.stringify(selector)});
        return el ? String(el.value || "") : "";
      })()
    `);
    if (got === text) return true;

    // Fallback: React's own value setter, then an input event it will see.
    await this.evaluate(`
      (function () {
        var el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        var proto = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, ${JSON.stringify(text)});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()
    `);
    const after = await this.evaluate(`
      (function () {
        var el = document.querySelector(${JSON.stringify(selector)});
        return el ? String(el.value || "") : "";
      })()
    `);
    return after === text;
  }

  async click(selector: string): Promise<boolean> {
    return !!(await this.evaluate(`
      (function () {
        var el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      })()
    `));
  }

  async screenshot(): Promise<string | null> {
    try {
      const res = await this.send("Page.captureScreenshot", {
        format: "jpeg",
        quality: 50,
      });
      return res?.data ? `data:image/jpeg;base64,${res.data}` : null;
    } catch {
      return null;
    }
  }

  async title(): Promise<string> {
    try {
      return await this.evaluate("document.title + ' — ' + location.href");
    } catch {
      return "(page unavailable)";
    }
  }

  close(): void {
    this.closed = true;
    try {
      this.ws.close();
    } catch { /* nothing useful to do */ }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
