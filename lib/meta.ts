import { getSessionCookies, setSessionCookies } from "./store";

/**
 * Session-based Instagram / Facebook DM client.
 * ============================================================
 * ⚠️  FRAGILE / UNOFFICIAL — READ THIS FIRST
 * ============================================================
 * The owner chose NOT to use a Meta App ID, so there is no official
 * Messenger/Instagram Messaging API here. Instead this client drives the
 * same web endpoints the Instagram/Facebook websites use, authenticated
 * with the owner's login session cookies.
 *
 * Consequences:
 * - Meta changes these private endpoints often — expect breakage and be
 *   ready to update selectors/endpoints.
 * - Aggressive polling can trigger rate limits or account flags. The cron
 *   runs every 2 minutes, which is deliberately gentle.
 * - 2FA / login challenges cannot be solved by this code. The practical
 *   setup is: owner logs in once in a normal browser, exports the session
 *   cookies, and pastes them into IG_COOKIES / FB_COOKIES env vars
 *   (see README). `loginWithPassword` below is a best-effort helper kept
 *   for completeness — prefer the cookie-paste flow.
 *
 * TODO: swap this entire module for the official Meta API
 * (Graph API + Instagram Messaging API) the day an App ID becomes
 * available — the rest of the codebase (cron route, agent, WhatsApp)
 * does not depend on these internals, only on the DMMessage interface.
 */

export type Platform = "instagram" | "facebook";

export interface DMMessage {
  id: string;
  threadId: string;
  sender: string; // username
  text: string;
  timestamp: string; // ISO
  platform: Platform;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export class MetaSessionClient {
  private cookies: string;
  readonly platform: Platform;

  private constructor(platform: Platform, cookies: string) {
    this.platform = platform;
    this.cookies = cookies;
  }

  /** Load a client from persisted/env session cookies. Null = not logged in. */
  static async load(platform: Platform): Promise<MetaSessionClient | null> {
    const cookies = await getSessionCookies(platform);
    if (!cookies) return null;
    return new MetaSessionClient(platform, cookies);
  }

  /** Persist raw `Cookie` header value (pasted from the owner's browser). */
  static async loginWithCookies(
    platform: Platform,
    cookies: string
  ): Promise<MetaSessionClient> {
    const client = new MetaSessionClient(platform, cookies.trim());
    await setSessionCookies(platform, client.cookies);
    return client;
  }

  /**
   * Best-effort password login for Instagram. Returns the client on success.
   * Throws with a clear message on 2FA/challenge — handle those manually
   * via the cookie-paste flow instead.
   */
  static async loginWithPassword(
    username: string,
    password: string
  ): Promise<MetaSessionClient> {
    // Step 1: grab a CSRF token the way the web login does.
    const pre = await fetch("https://www.instagram.com/accounts/login/", {
      headers: { "User-Agent": UA },
    });
    const setCookie = pre.headers.get("set-cookie") ?? "";
    const csrf =
      /csrftoken=([^;]+)/.exec(setCookie)?.[1] ??
      /csrftoken=([^;]+)/.exec(
        pre.headers.get("x-ig-set-cookie") ?? ""
      )?.[1] ??
      "";
    if (!csrf) {
      throw new Error(
        "Could not obtain Instagram CSRF token — use cookie-paste login instead."
      );
    }
    // Step 2: submit credentials (Instagram expects encrypted password format;
    // we send the documented #PWD_INSTAGRAM_BROWSER format).
    const encPassword = `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(
      Date.now() / 1000
    )}:${password}`;
    const res = await fetch("https://www.instagram.com/accounts/login/ajax/", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken": csrf,
        Cookie: `csrftoken=${csrf}`,
        Referer: "https://www.instagram.com/accounts/login/",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({
        username,
        enc_password: encPassword,
        queryParams: "{}",
        optIntoOneTap: "false",
      }).toString(),
    });
    const data = (await res.json().catch(() => ({}))) as {
      authenticated?: boolean;
      two_factor_required?: boolean;
      message?: string;
    };
    if (data.two_factor_required) {
      throw new Error(
        "Instagram requires 2FA for this login — complete it in a browser and use cookie-paste login instead."
      );
    }
    if (!data.authenticated) {
      throw new Error(
        `Instagram login failed: ${data.message || "bad credentials or challenge required"} — use cookie-paste login instead.`
      );
    }
    const cookies = res.headers.get("set-cookie") ?? "";
    const client = new MetaSessionClient("instagram", cookies);
    await setSessionCookies("instagram", cookies);
    return client;
  }

  private authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const csrf = /csrftoken=([^;]+)/.exec(this.cookies)?.[1] || "";
    return {
      "User-Agent": UA,
      Cookie: this.cookies,
      "X-CSRFToken": csrf,
      "X-IG-App-ID": "1217981644879628",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.instagram.com/",
      ...extra,
    };
  }

  /**
   * Fetch recent direct-message threads and flatten new inbound texts.
   * Best-effort against Instagram's private web API; Facebook uses the
   * same shape via its own endpoint. Returns [] (never throws) so a
   * single platform hiccup can't kill the whole cron run — callers dedupe
   * via store.markProcessed().
   */
  async getNewMessages(): Promise<DMMessage[]> {
    try {
      if (this.platform === "instagram") return await this.igInbox();
      return await this.fbInbox();
    } catch (err) {
      console.error(`[${this.platform}] getNewMessages failed:`, err);
      return [];
    }
  }

  private async igInbox(): Promise<DMMessage[]> {
    const res = await fetch(
      "https://www.instagram.com/api/v1/direct_v2/inbox/?limit=20",
      { headers: this.authHeaders() }
    );
    if (!res.ok) throw new Error(`IG inbox HTTP ${res.status}`);
    const data = (await res.json()) as {
      inbox?: {
        threads?: {
          thread_id?: string;
          thread_title?: string;
          items?: {
            item_id?: string;
            user_id?: string;
            text?: string;
            timestamp?: number;
          }[];
          users?: { username?: string }[];
        }[];
      };
    };
    const out: DMMessage[] = [];
    for (const t of data.inbox?.threads ?? []) {
      const threadId = t.thread_id ?? "";
      const sender = t.users?.[0]?.username ?? "customer";
      for (const item of t.items ?? []) {
        if (!item.text || !item.item_id) continue;
        out.push({
          id: `ig:${item.item_id}`,
          threadId: `ig:${threadId}`,
          sender,
          text: item.text,
          timestamp: new Date((item.timestamp ?? 0) * 1000).toISOString(),
          platform: "instagram",
        });
      }
    }
    return out;
  }

  private async fbInbox(): Promise<DMMessage[]> {
    // Facebook Page-less personal messaging has no stable private endpoint;
    // this is intentionally a documented stub until either the official
    // API is adopted or a working session flow is captured.
    // TODO: implement against facebook.com messages web endpoints.
    console.warn("[facebook] session inbox not implemented yet — skipping");
    return [];
  }

  /** Send a text reply into a thread. Thread ids carry an `ig:`/`fb:` prefix. */
  async sendMessage(threadId: string, text: string): Promise<void> {
    if (this.platform === "instagram" && threadId.startsWith("ig:")) {
      const id = threadId.slice(3);
      const res = await fetch(
        `https://www.instagram.com/api/v1/direct_v2/threads/${encodeURIComponent(
          id
        )}/broadcast/text/`,
        {
          method: "POST",
          headers: this.authHeaders({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
          body: new URLSearchParams({ text }).toString(),
        }
      );
      if (!res.ok) throw new Error(`IG send HTTP ${res.status}`);
      return;
    }
    // TODO: facebook send path (see fbInbox note above).
    throw new Error(`sendMessage not implemented for ${this.platform}`);
  }
}
