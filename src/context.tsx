"use client";

import React from "react";
import { KernelApiClient } from "@cadbuildr/cad-kernel-r3f";

import { createKernelExclusiveQueue } from "./kernelExclusiveQueue";

const DEFAULT_HUB_BASE_URL = "https://hub.cadbuildr.com";

// How early before the cbv1 expires we refresh. 60s is enough headroom that
// in-flight kernel-api requests using the old token always finish.
const REFRESH_LEAD_SECONDS = 60;

// Minimum delay between refresh attempts on error, to avoid hammering hub if
// it's down (e.g. dev hub revision rolling).
const MIN_REFRESH_RETRY_MS = 30_000;

export interface CadbuildrProviderProps {
  /**
   * Partner-facing publishable identifier (the `<keyId>` half of an
   * `cbsdk_<keyId>_<secret>` partner key, e.g. `7ef7b4133ef1e6c2`).
   *
   * When set, the provider mints a fresh `cbv1.*` token from the hub on mount
   * and refreshes it before expiry — the partner secret never ships in the
   * bundle. This is the Stripe-publishable-key / Mapbox-token pattern, and
   * the hub side enforces the partner's `allowed_origins` allowlist against
   * the browser's Origin header so it's safe to expose this `keyId`.
   *
   * Mutually exclusive with {@link sessionToken}.
   */
  keyId?: string;
  /**
   * Pre-minted `cbv1.*` session token. Use this if you mint server-side and
   * pass the token down (SSR, server-rendered storefront, native shell with
   * its own broker, etc.). The provider does **not** refresh server-minted
   * tokens — the consumer owns the lifecycle.
   *
   * Mutually exclusive with {@link keyId}.
   */
  sessionToken?: string;
  /** Project key, kept for analytics / future per-project gating. */
  projectKey?: string;
  /** Override the kernel-api origin (e.g. for self-hosted or staging). */
  baseUrl?: string;
  /**
   * Hub base URL used by the keyId browser flow to call
   * `/api/v1/sdk/session-tokens`. Defaults to the production hub
   * (`https://hub.cadbuildr.com`). Override for dev or self-hosted hub.
   */
  hubBaseUrl?: string;
  /** Custom fetch (for SSR / test rigs). */
  fetchImpl?: typeof fetch;
  children: React.ReactNode;
}

export type SessionTokenStatus =
  | { state: "loading" }
  | { state: "ready"; token: string; expiresAt: number }
  | { state: "error"; error: string };

export interface CadbuildrContextValue {
  sessionToken: string | undefined;
  /**
   * `provided` — partner passed `sessionToken` directly.
   * `keyId-minted` — provider minted via the browser flow.
   * `loading` / `error` — keyId flow in flight, or last mint failed.
   */
  tokenStatus: SessionTokenStatus | { state: "provided"; token: string };
  projectKey?: string;
  baseUrl?: string;
  kernelClient: KernelApiClient;
  fetchImpl: typeof fetch;
  /** Serialize kernel-api work per provider to avoid worker-races. */
  runKernelExclusive: <T>(task: () => Promise<T>) => Promise<T>;
  /** Force a refresh of the cbv1 (only meaningful in the keyId flow). */
  refreshSessionToken: () => void;
}

const CadbuildrContext = React.createContext<CadbuildrContextValue | null>(null);

interface MintRequest {
  hubBaseUrl: string;
  keyId: string;
  projectKey?: string;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}

interface MintResponse {
  token: string;
  expiresAt: number;
  mode?: "secret" | "publishable";
}

// Calls hub's POST /api/v1/sdk/session-tokens in publishable mode (no
// Authorization header, body has keyId, request Origin is auto-attached by
// the browser and validated server-side against the key's allowed_origins).
async function mintBrowserSessionToken(
  req: MintRequest,
): Promise<MintResponse> {
  const url = `${req.hubBaseUrl.replace(/\/$/, "")}/api/v1/sdk/session-tokens`;
  const body: Record<string, unknown> = { keyId: req.keyId };
  if (req.projectKey) body.projectId = req.projectKey;
  const res = await req.fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: req.signal,
    // Defaults to "cors"; explicit for clarity.
    mode: "cors",
    credentials: "omit",
  });
  if (!res.ok) {
    let detail: string;
    try {
      const json = (await res.json()) as { error?: string };
      detail = json.error ?? res.statusText;
    } catch {
      detail = res.statusText;
    }
    throw new Error(
      `CadbuildrProvider: failed to mint session token (HTTP ${res.status}): ${detail}`,
    );
  }
  const json = (await res.json()) as MintResponse;
  if (!json.token || typeof json.expiresAt !== "number") {
    throw new Error(
      "CadbuildrProvider: hub returned an unexpected session-token response shape.",
    );
  }
  return json;
}

export function CadbuildrProvider({
  keyId,
  sessionToken,
  projectKey,
  baseUrl,
  hubBaseUrl,
  fetchImpl,
  children,
}: CadbuildrProviderProps): React.ReactElement {
  if (keyId && sessionToken) {
    throw new Error(
      "CadbuildrProvider: pass either `keyId` (browser flow) or `sessionToken` (server flow) — not both.",
    );
  }
  if (!keyId && !sessionToken) {
    throw new Error(
      "CadbuildrProvider: either `keyId` (browser flow) or `sessionToken` (server flow) is required.",
    );
  }

  const resolvedFetch = React.useMemo(
    () => fetchImpl ?? (globalThis.fetch.bind(globalThis) as typeof fetch),
    [fetchImpl],
  );
  const resolvedHubBaseUrl = hubBaseUrl ?? DEFAULT_HUB_BASE_URL;
  const runKernelExclusive = React.useMemo(() => createKernelExclusiveQueue(), []);

  // --- keyId (browser) flow: manage cbv1 lifecycle here. ---
  const [mintedStatus, setMintedStatus] = React.useState<SessionTokenStatus>(
    keyId ? { state: "loading" } : { state: "error", error: "no-key" },
  );
  const refreshCounterRef = React.useRef(0);

  const requestRefresh = React.useCallback(() => {
    refreshCounterRef.current += 1;
    setMintedStatus({ state: "loading" });
  }, []);

  React.useEffect(() => {
    if (!keyId) return;
    let cancelled = false;
    const controller = new AbortController();
    const refreshId = refreshCounterRef.current;

    (async () => {
      try {
        const minted = await mintBrowserSessionToken({
          hubBaseUrl: resolvedHubBaseUrl,
          keyId,
          projectKey,
          fetchImpl: resolvedFetch,
          signal: controller.signal,
        });
        if (cancelled || refreshId !== refreshCounterRef.current) return;
        setMintedStatus({
          state: "ready",
          token: minted.token,
          expiresAt: minted.expiresAt,
        });
      } catch (err) {
        if (cancelled || refreshId !== refreshCounterRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setMintedStatus({ state: "error", error: message });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [keyId, projectKey, resolvedHubBaseUrl, resolvedFetch, mintedStatus.state === "loading"]);

  // Schedule auto-refresh.
  React.useEffect(() => {
    if (!keyId) return;
    if (mintedStatus.state === "ready") {
      const msUntilRefresh = Math.max(
        1000,
        mintedStatus.expiresAt * 1000 - Date.now() - REFRESH_LEAD_SECONDS * 1000,
      );
      const timer = window.setTimeout(() => requestRefresh(), msUntilRefresh);
      return () => window.clearTimeout(timer);
    }
    if (mintedStatus.state === "error") {
      const timer = window.setTimeout(() => requestRefresh(), MIN_REFRESH_RETRY_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [keyId, mintedStatus, requestRefresh]);

  const effectiveToken: string | undefined = sessionToken
    ?? (mintedStatus.state === "ready" ? mintedStatus.token : undefined);

  const kernelClient = React.useMemo(
    () =>
      new KernelApiClient({
        baseUrl,
        apiToken: effectiveToken,
        fetchImpl: resolvedFetch,
      }),
    [baseUrl, effectiveToken, resolvedFetch],
  );

  const tokenStatus = React.useMemo<CadbuildrContextValue["tokenStatus"]>(
    () =>
      sessionToken
        ? { state: "provided", token: sessionToken }
        : mintedStatus,
    [sessionToken, mintedStatus],
  );

  const value = React.useMemo<CadbuildrContextValue>(
    () => ({
      sessionToken: effectiveToken,
      tokenStatus,
      projectKey,
      baseUrl,
      kernelClient,
      fetchImpl: resolvedFetch,
      runKernelExclusive,
      refreshSessionToken: requestRefresh,
    }),
    [
      effectiveToken,
      tokenStatus,
      projectKey,
      baseUrl,
      kernelClient,
      resolvedFetch,
      runKernelExclusive,
      requestRefresh,
    ],
  );

  return <CadbuildrContext.Provider value={value}>{children}</CadbuildrContext.Provider>;
}

export function useCadbuildrContext(): CadbuildrContextValue {
  const value = React.useContext(CadbuildrContext);
  if (!value) {
    throw new Error(
      "useCadbuildrContext must be called inside a <CadbuildrProvider>.",
    );
  }
  return value;
}
