"use client";

import React from "react";

import {
  buildPartsTree,
  isNodeVisible,
  walkPartsTree,
  type PartsTreeNode,
} from "./partsTree";
import type { PartInstancePayload } from "./useCadbuildrRender";

export interface CadbuildrPartsTreeProps {
  /** Part instances from the latest render (drives the tree shape). */
  partInstances: PartInstancePayload[] | undefined;
  /** Currently-hidden node ids. */
  hidden: ReadonlySet<string>;
  /** Toggle a single node's visibility. */
  onToggle: (nodeId: string) => void;
  /** Optional title shown above the tree. */
  title?: string;
  /** Extra class on the root element for partner styling. */
  className?: string;
  /** Inline style override for the root element. */
  style?: React.CSSProperties;
}

const EyeOpen = (): React.ReactElement => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

const EyeClosed = (): React.ReactElement => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M3 3l18 18M10.6 6.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.6 4.2M6.1 7.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 3.9-.8"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Chevron = ({ open }: { open: boolean }): React.ReactElement => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms ease" }}
  >
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface RowProps {
  node: PartsTreeNode;
  hidden: ReadonlySet<string>;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onCollapseToggle: (id: string) => void;
}

function TreeRow({ node, hidden, collapsed, onToggle, onCollapseToggle }: RowProps): React.ReactElement {
  const hasChildren = node.children.length > 0;
  const isOpen = !collapsed.has(node.id);
  const visible = isNodeVisible(node, hidden);
  const ownHidden = hidden.has(node.id);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 6px",
          paddingLeft: 6 + node.depth * 14,
          borderRadius: 6,
          opacity: visible ? 1 : 0.5,
          fontSize: "0.82rem",
          lineHeight: 1.3,
        }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onCollapseToggle(node.id)}
          aria-label={hasChildren ? (isOpen ? "Collapse" : "Expand") : undefined}
          style={{
            all: "unset",
            cursor: hasChildren ? "pointer" : "default",
            width: 12,
            height: 12,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--cb-text-muted, #c9bfb4)",
            visibility: hasChildren ? "visible" : "hidden",
          }}
        >
          <Chevron open={isOpen} />
        </button>
        <span
          style={{
            flex: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontWeight: node.kind === "assembly" ? 600 : 400,
            color: node.kind === "assembly" ? "var(--cb-text, #f2ece6)" : "var(--cb-text-muted, #c9bfb4)",
          }}
          title={node.name}
        >
          {node.name}
        </span>
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          aria-label={ownHidden ? `Show ${node.name}` : `Hide ${node.name}`}
          aria-pressed={ownHidden}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            color: ownHidden ? "var(--cb-orange, #e87724)" : "var(--cb-text-muted, #c9bfb4)",
          }}
        >
          {visible ? <EyeOpen /> : <EyeClosed />}
        </button>
      </div>
      {hasChildren && isOpen
        ? node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              hidden={hidden}
              collapsed={collapsed}
              onToggle={onToggle}
              onCollapseToggle={onCollapseToggle}
            />
          ))
        : null}
    </>
  );
}

/**
 * A compact assembly tree with per-node show/hide toggles. Mirrors the parts
 * tree in the full CADbuildr CAD viewer, but self-contained so partners can drop
 * it next to `<CadbuildrViewer>`. Theme it via the `--cb-*` CSS variables or the
 * `style` / `className` props.
 */
export function CadbuildrPartsTree({
  partInstances,
  hidden,
  onToggle,
  title = "Components",
  className,
  style,
}: CadbuildrPartsTreeProps): React.ReactElement | null {
  const roots = React.useMemo(() => buildPartsTree(partInstances), [partInstances]);

  // Assemblies start expanded; default-collapse nothing.
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());
  const onCollapseToggle = React.useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const counts = React.useMemo(() => {
    let parts = 0;
    walkPartsTree(roots, (n) => {
      if (n.kind === "part") parts += 1;
    });
    return parts;
  }, [roots]);

  if (roots.length === 0) return null;

  return (
    <div
      className={className}
      style={{
        background: "var(--cb-surface, rgba(26, 31, 33, 0.92))",
        border: "1px solid var(--cb-border, #353c3e)",
        borderRadius: 10,
        padding: 8,
        maxHeight: "100%",
        overflowY: "auto",
        minWidth: 200,
        ...style,
      }}
    >
      {title ? (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            margin: "2px 6px 6px",
          }}
        >
          <span
            style={{
              fontSize: "0.72rem",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--cb-orange-soft, #fdba74)",
              fontWeight: 700,
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--cb-text-muted, #c9bfb4)" }}>
            {counts} part{counts === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}
      {roots.map((root) => (
        <TreeRow
          key={root.id}
          node={root}
          hidden={hidden}
          collapsed={collapsed}
          onToggle={onToggle}
          onCollapseToggle={onCollapseToggle}
        />
      ))}
    </div>
  );
}
