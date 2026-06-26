"use client";

import React from "react";

export interface CadbuildrLoadingOverlayProps {
  /** Optional caption under the spinner (e.g. "Rendering…"). */
  label?: string;
  /** Spinner diameter in px (default `44`). */
  size?: number;
  /** Spinner color (default the CADbuildr orange via `--cb-orange`). */
  color?: string;
  /** Dim the area behind the spinner (default `true`). */
  backdrop?: boolean;
  /** Extra class on the root element. */
  className?: string;
  /** Inline style override for the root element. */
  style?: React.CSSProperties;
}

/**
 * A self-contained loading wheel that fills its (positioned) parent. Uses an
 * inline SVG with SMIL rotation, so it needs no global CSS, no keyframes, and no
 * third-party spinner dependency — drop it into any relatively/absolutely
 * positioned container. `<CadbuildrViewer>` renders it by default while a render
 * is in flight; it is also exported for custom scenes.
 */
export function CadbuildrLoadingOverlay({
  label,
  size = 44,
  color,
  backdrop = true,
  className,
  style,
}: CadbuildrLoadingOverlayProps): React.ReactElement {
  const stroke = color ?? "var(--cb-orange, #e87724)";
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        pointerEvents: "none",
        background: backdrop ? "rgba(10, 14, 20, 0.35)" : "transparent",
        zIndex: 3,
        ...style,
      }}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
    >
      <svg width={size} height={size} viewBox="0 0 50 50" aria-hidden="true">
        <circle cx="25" cy="25" r="20" fill="none" stroke={stroke} strokeOpacity="0.2" strokeWidth="5" />
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke={stroke}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="80 50"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 25 25"
            to="360 25 25"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
      {label ? (
        <span
          style={{
            fontSize: "0.85rem",
            color: "var(--cb-text-muted, #c9bfb4)",
            fontFamily: "inherit",
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
