"use client";

import React from "react";

/**
 * Auto-UI for ``parameters.schema.json`` (T10).
 *
 * Vanilla HTML controls — no UI-lib dependency — so partners can drop the
 * SDK into any storefront and restyle via className overrides. Mirrors the
 * descriptor shape emitted by ``cadbuildr.foundation.parameters``.
 */

export type ParameterValue = number | string | boolean;
export type ParameterValueMap = Record<string, ParameterValue>;

export interface IntParameterSchema {
  id: string;
  type: "int";
  default: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  description?: string;
}

export interface FloatParameterSchema {
  id: string;
  type: "float";
  default: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  description?: string;
}

export interface BoolParameterSchema {
  id: string;
  type: "bool";
  default: boolean;
  label?: string;
  description?: string;
}

export interface ColorParameterSchema {
  id: string;
  type: "color";
  default: string;
  choices?: string[];
  label?: string;
  description?: string;
}

export interface EnumParameterSchema {
  id: string;
  type: "enum";
  default: string;
  choices: string[];
  label?: string;
  description?: string;
}

export type ParameterSchemaEntry =
  | IntParameterSchema
  | FloatParameterSchema
  | BoolParameterSchema
  | ColorParameterSchema
  | EnumParameterSchema;

export interface ProjectParameterSchema {
  project_id: string;
  title?: string;
  description?: string;
  parameters: ParameterSchemaEntry[];
}

export interface CadbuildrParameterFormProps {
  schema: ProjectParameterSchema;
  value?: ParameterValueMap;
  onChange: (next: ParameterValueMap) => void;
  /** Optional debounce window (ms) before notifying `onChange`. Default 150. */
  debounceMs?: number;
  className?: string;
  /** Render-prop override; partners can replace the row layout entirely. */
  renderRow?: (entry: ParameterSchemaEntry, control: React.ReactNode) => React.ReactNode;
}

export function defaultValuesForSchema(
  schema: ProjectParameterSchema,
): ParameterValueMap {
  const out: ParameterValueMap = {};
  for (const p of schema.parameters) {
    out[p.id] = p.default;
  }
  return out;
}

const DEFAULT_DEBOUNCE_MS = 150;

export function CadbuildrParameterForm({
  schema,
  value,
  onChange,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  className,
  renderRow,
}: CadbuildrParameterFormProps): React.ReactElement {
  const initial = React.useMemo(() => value ?? defaultValuesForSchema(schema), [schema, value]);
  const [draft, setDraft] = React.useState<ParameterValueMap>(initial);

  // Sync external value changes (e.g., schema swap) into the draft.
  React.useEffect(() => {
    if (value !== undefined) setDraft(value);
  }, [value]);

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const notifyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleNotify = React.useCallback(
    (next: ParameterValueMap) => {
      if (notifyTimer.current) clearTimeout(notifyTimer.current);
      notifyTimer.current = setTimeout(() => {
        onChangeRef.current(next);
        notifyTimer.current = null;
      }, debounceMs);
    },
    [debounceMs],
  );

  React.useEffect(() => {
    return () => {
      if (notifyTimer.current) clearTimeout(notifyTimer.current);
    };
  }, []);

  const setValue = React.useCallback(
    (id: string, next: ParameterValue) => {
      setDraft((prev) => {
        if (prev[id] === next) return prev;
        const updated = { ...prev, [id]: next };
        scheduleNotify(updated);
        return updated;
      });
    },
    [scheduleNotify],
  );

  return (
    <div className={className} data-cadbuildr-parameter-form>
      {schema.parameters.map((entry) => {
        const control = renderControl(entry, draft[entry.id] ?? entry.default, setValue);
        const row = (
          <ParameterRow key={entry.id} entry={entry} control={control} />
        );
        return renderRow ? renderRow(entry, row) : row;
      })}
    </div>
  );
}

function ParameterRow({
  entry,
  control,
}: {
  entry: ParameterSchemaEntry;
  control: React.ReactNode;
}): React.ReactElement {
  return (
    <label
      className="cadbuildr-parameter-row"
      htmlFor={`cadbuildr-param-${entry.id}`}
      style={{ display: "flex", flexDirection: "column", gap: 4, margin: "8px 0" }}
    >
      <span className="cadbuildr-parameter-label" style={{ fontWeight: 600 }}>
        {entry.label ?? entry.id}
      </span>
      {control}
      {entry.description ? (
        <span className="cadbuildr-parameter-description" style={{ fontSize: 12, opacity: 0.7 }}>
          {entry.description}
        </span>
      ) : null}
    </label>
  );
}

function renderControl(
  entry: ParameterSchemaEntry,
  value: ParameterValue,
  setValue: (id: string, next: ParameterValue) => void,
): React.ReactElement {
  const inputId = `cadbuildr-param-${entry.id}`;
  switch (entry.type) {
    case "int":
    case "float": {
      const isInt = entry.type === "int";
      const step = entry.step ?? (isInt ? 1 : 0.1);
      const min = entry.min;
      const max = entry.max;
      const numericValue = typeof value === "number" ? value : entry.default;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {min !== undefined && max !== undefined ? (
            <input
              id={inputId}
              type="range"
              min={min}
              max={max}
              step={step}
              value={numericValue}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                setValue(entry.id, isInt ? Math.round(next) : next);
              }}
              style={{ flex: 1 }}
            />
          ) : null}
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={numericValue}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (Number.isFinite(next)) setValue(entry.id, isInt ? Math.round(next) : next);
            }}
            style={{ width: 80 }}
          />
        </div>
      );
    }
    case "bool": {
      const boolValue = typeof value === "boolean" ? value : entry.default;
      return (
        <input
          id={inputId}
          type="checkbox"
          checked={boolValue}
          onChange={(event) => setValue(entry.id, event.currentTarget.checked)}
        />
      );
    }
    case "color": {
      const stringValue = typeof value === "string" ? value : entry.default;
      if (entry.choices && entry.choices.length > 0) {
        return (
          <select
            id={inputId}
            value={stringValue}
            onChange={(event) => setValue(entry.id, event.currentTarget.value)}
          >
            {entry.choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        );
      }
      return (
        <input
          id={inputId}
          type="color"
          value={stringValue}
          onChange={(event) => setValue(entry.id, event.currentTarget.value)}
        />
      );
    }
    case "enum": {
      const stringValue = typeof value === "string" ? value : entry.default;
      return (
        <select
          id={inputId}
          value={stringValue}
          onChange={(event) => setValue(entry.id, event.currentTarget.value)}
        >
          {entry.choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      );
    }
    default: {
      const _exhaustive: never = entry;
      void _exhaustive;
      return <span>Unsupported parameter type.</span>;
    }
  }
}
