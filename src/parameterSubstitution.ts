/**
 * Frozen-DAG parameter substitution.
 *
 * A "template DAG" is a normal kernel-api DAG except that certain primitive
 * values inside node params are tagged as parameter references:
 *
 *     { "__cadbuildr_param__": "n_length" }
 *
 * At runtime the SDK walks the template and rewrites those markers with the
 * partner-supplied values from the parameter form (T11). The result is a
 * plain DAG kernel-api can render — no Pyodide required.
 *
 * Markers may appear anywhere a primitive value (int / float / bool / string)
 * is expected. Arrays and objects are walked recursively. A marker whose
 * declared parameter is not provided throws a `MissingParameterValueError`.
 */

import type { ParameterValue, ParameterValueMap } from "./CadbuildrParameterForm";

export const PARAM_MARKER_KEY = "__cadbuildr_param__";

export interface ParameterMarker {
  [PARAM_MARKER_KEY]: string;
}

export function isParameterMarker(value: unknown): value is ParameterMarker {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)[PARAM_MARKER_KEY] === "string" &&
    Object.keys(value).length === 1
  );
}

export class MissingParameterValueError extends Error {
  constructor(public readonly parameterId: string) {
    super(`Parameter "${parameterId}" required by the DAG template was not supplied.`);
    this.name = "MissingParameterValueError";
  }
}

/**
 * Recursively replaces every {@link ParameterMarker} in `template` with the
 * corresponding value from `values`. Returns a new structure; the input is not
 * mutated. Throws `MissingParameterValueError` if a referenced parameter is
 * absent from `values`.
 */
export function substituteParameterInputs<T = unknown>(
  template: T,
  values: ParameterValueMap,
): T {
  return walk(template, values) as T;
}

function walk(node: unknown, values: ParameterValueMap): unknown {
  if (isParameterMarker(node)) {
    const id = node[PARAM_MARKER_KEY];
    if (!Object.prototype.hasOwnProperty.call(values, id)) {
      throw new MissingParameterValueError(id);
    }
    return coerce(values[id] as ParameterValue);
  }
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, values));
  }
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = walk(value, values);
    }
    return out;
  }
  return node;
}

function coerce(value: ParameterValue): ParameterValue {
  // Parameter values from the form are already ParameterValue; this hook lets
  // us add per-type post-processing later (e.g. resolving color slugs to
  // hex). Today it's the identity.
  return value;
}

/**
 * Visits the template and returns the set of parameter IDs it references.
 * Used for validation: surface "the template needs `n_length` but the form
 * schema does not declare it" before the request hits kernel-api.
 */
export function collectReferencedParameterIds(template: unknown): Set<string> {
  const out = new Set<string>();
  const visit = (node: unknown): void => {
    if (isParameterMarker(node)) {
      out.add(node[PARAM_MARKER_KEY]);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) visit(value);
    }
  };
  visit(template);
  return out;
}
