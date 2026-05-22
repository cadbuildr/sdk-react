"use client";

import React from "react";

import type { KernelDag } from "@cadbuildr/cad-kernel-r3f";

import { useCadbuildrContext } from "./context";

export type RenderStatus = "idle" | "loading" | "ready" | "error";

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
      try {
        const base = (baseUrl ?? "https://kernel-api.cadbuildr.com").replace(/\/$/, "");
        const url = `${base}/v1/kernels/replicad/render`;
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (sessionToken) {
          headers["authorization"] = `Bearer ${sessionToken}`;
        }
        const response = await fetchImpl(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ dag, format: "json", kernel: "replicad" }),
          signal: controller.signal,
        });
        const reqId = response.headers.get("x-request-id") ?? undefined;
        if (!response.ok) {
          const text = await response.text().catch(() => "");
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
      } catch (cause) {
        if (cancelled || (cause instanceof Error && cause.name === "AbortError")) return;
        const err = cause instanceof Error ? cause : new Error(String(cause));
        setMeshPayload(null);
        setError(err);
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dag, baseUrl, sessionToken, fetchImpl, runKernelExclusive]);

  return { meshPayload, status, error, requestId };
}
