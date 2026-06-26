"use client";

import React from "react";

import type { KernelDag } from "@cadbuildr/cad-kernel-r3f";

import { useCadbuildrContext } from "./context";

export type RenderStatus = "idle" | "loading" | "ready" | "error";

// The hosted kernel-api runs on autoscaling infra that can scale to zero; the
// first request after an idle period cold-starts (boot + lazy WASM load) and may
// 504 at the gateway. A single warm retry transparently rides over that — the
// second attempt hits the now-warm instance.
const MAX_RENDER_ATTEMPTS = 2;
const RENDER_RETRY_DELAY_MS = 1500;

const delay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

export interface ViewerMeshEntry {
  type: "mesh";
  data: {
    faces: unknown;
    color?: [number, number, number];
  };
}

export interface PartInstancePayload {
  hash: string;
  tf: number[];
  color?: [number, number, number];
  /** Stable instance id (kernel-assigned). */
  id?: string;
  /** Assembly path, e.g. `"pcb/components__689a/led__d4c0"`. Drives the tree. */
  path?: string;
  /** Display name of the leaf part, e.g. `"led"`. */
  name?: string;
}

export interface SerializedMeshPayload {
  store: Record<string, ViewerMeshEntry>;
  partInstances?: PartInstancePayload[];
}

export interface UseCadbuildrRenderResult {
  meshPayload: SerializedMeshPayload | null;
  status: RenderStatus;
  error: Error | null;
  requestId: string | undefined;
}

export interface UseCadbuildrRenderArgs {
  dag: KernelDag | null;
}

/**
 * Headless mesh fetcher: posts the DAG to kernel-api, returns the JSON mesh
 * payload (per-instance colors). Used internally by `<CadbuildrViewer>`; also
 * exposed as the SDK's "escape hatch" for partners who want to drive their own
 * three.js scene.
 */
export function useCadbuildrRender({ dag }: UseCadbuildrRenderArgs): UseCadbuildrRenderResult {
  const { baseUrl, sessionToken, fetchImpl, runKernelExclusive } = useCadbuildrContext();
  const [meshPayload, setMeshPayload] = React.useState<SerializedMeshPayload | null>(null);
  const [status, setStatus] = React.useState<RenderStatus>("idle");
  const [error, setError] = React.useState<Error | null>(null);
  const [requestId, setRequestId] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!dag) {
      setMeshPayload(null);
      setStatus("idle");
      setError(null);
      setRequestId(undefined);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    void runKernelExclusive(async () => {
      const base = (baseUrl ?? "https://kernel-api.cadbuildr.com").replace(/\/$/, "");
      const url = `${base}/v1/kernels/replicad/render`;
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (sessionToken) {
        headers["authorization"] = `Bearer ${sessionToken}`;
      }
      const requestBody = JSON.stringify({ dag, format: "json", kernel: "replicad" });

      for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
        const lastAttempt = attempt === MAX_RENDER_ATTEMPTS;
        try {
          const response = await fetchImpl(url, {
            method: "POST",
            headers,
            body: requestBody,
            signal: controller.signal,
          });
          const reqId = response.headers.get("x-request-id") ?? undefined;
          if (!response.ok) {
            const text = await response.text().catch(() => "");
            // 5xx / 408 are transient (cold start, gateway timeout) — retry once.
            if (!lastAttempt && (response.status >= 500 || response.status === 408)) {
              await delay(RENDER_RETRY_DELAY_MS, controller.signal);
              if (cancelled) return;
              continue;
            }
            throw new Error(
              `kernel-api render failed (${response.status}): ${text.slice(0, 200)}`,
            );
          }
          const body = (await response.json()) as { format?: string; mesh?: SerializedMeshPayload };
          if (cancelled) return;
          if (body.format !== "json" || !body.mesh) {
            throw new Error("kernel-api response is missing the JSON mesh payload.");
          }
          setMeshPayload(body.mesh);
          setRequestId(reqId);
          setStatus("ready");
          return;
        } catch (cause) {
          if (cancelled || (cause instanceof Error && cause.name === "AbortError")) return;
          // A bare fetch rejection (TypeError: "Failed to fetch") is a network /
          // connection-drop error — also transient; retry once.
          if (!lastAttempt && cause instanceof TypeError) {
            await delay(RENDER_RETRY_DELAY_MS, controller.signal).catch(() => {});
            if (cancelled) return;
            continue;
          }
          const err = cause instanceof Error ? cause : new Error(String(cause));
          setMeshPayload(null);
          setError(err);
          setStatus("error");
          return;
        }
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dag, baseUrl, sessionToken, fetchImpl, runKernelExclusive]);

  return { meshPayload, status, error, requestId };
}
