/**
 * Schema-driven post-processing for extractor output.
 *
 * LLMs return usable JSON with unusable shapes: keys in the wrong case,
 * arrays with duplicate entries, `"null"` strings, smuggled markdown fences.
 * This reconciles a raw extractor payload against a JSON schema so the caller
 * can trust the result without a second model call.
 */

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  nullable?: boolean;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** Pulls the JSON body out of a model response that may be fenced or chatty. */
export function extractJsonBlock(raw: string): unknown {
  let text = raw.trim();

  const fenced = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(text);
  if (fenced?.[1]) text = fenced[1].trim();

  // If the model prefixed prose, take the first balanced {...} or [...].
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const start = text.search(/[[{]/);
    if (start >= 0) text = text.slice(start);
  }

  try {
    return JSON.parse(text);
  } catch {
    // Repair trailing commas, which the most common malformation.
    try {
      return JSON.parse(text.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

function remapKeys(value: unknown, schema: unknown): unknown {
  if (!isObject(schema) && !Array.isArray(schema)) return value;

  if (Array.isArray(value)) {
    const itemSchema = isObject(schema)
      ? (schema as JsonSchema).items
      : undefined;
    return value.map((entry) => remapKeys(entry, itemSchema));
  }
  if (!isObject(value)) return value;

  const props = (schema as JsonSchema).properties;
  if (!props) return value;

  const canonical = new Map(Object.keys(props).map((key) => [normalizeKey(key), key]));
  const out: JsonObject = {};

  for (const [key, entry] of Object.entries(value)) {
    const target = key in props ? key : (canonical.get(normalizeKey(key)) ?? key);
    out[target] = remapKeys(entry, props[target]);
  }
  return out;
}

function allowsNull(schema: unknown): boolean {
  if (!isObject(schema)) return false;
  const type = schema.type;
  if (type === "null") return true;
  if (Array.isArray(type) && type.includes("null")) return true;
  if (schema.nullable === true) return true;
  for (const branchKey of ["anyOf", "oneOf"] as const) {
    const branches = schema[branchKey];
    if (Array.isArray(branches) && branches.some((branch) => allowsNull(branch))) {
      return true;
    }
  }
  return false;
}

function coerceNulls(value: unknown, schema: unknown): unknown {
  if (Array.isArray(value)) {
    const itemSchema = isObject(schema) ? (schema as JsonSchema).items : undefined;
    return value.map((entry) => coerceNulls(entry, itemSchema));
  }
  if (!isObject(value)) return value;

  const props = (schema as JsonSchema).properties;
  if (!props) return value;

  const out: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    const fieldSchema = props[key];
    if (!fieldSchema) continue;

    const isNullish =
      entry === null ||
      entry === undefined ||
      entry === "" ||
      entry === "null" ||
      entry === "None" ||
      entry === "N/A" ||
      entry === "undefined";

    if (isNullish) {
      out[key] = allowsNull(fieldSchema) ? null : undefined;
      continue;
    }
    out[key] = coerceNulls(entry, fieldSchema);
  }
  return out;
}

const JUNK = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b\u200c\ufeff]/g;

function sanitizeStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(JUNK, "").replace(/\s+\n/g, "\n").trim();
  }
  if (Array.isArray(value)) return value.map(sanitizeStrings);
  if (isObject(value)) {
    const out: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) out[key] = sanitizeStrings(entry);
    return out;
  }
  return value;
}

function dedupeArrays(value: unknown): unknown {
  if (Array.isArray(value)) {
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const entry of value) {
      const key =
        typeof entry === "string"
          ? entry.toLowerCase()
          : JSON.stringify(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(dedupeArrays(entry));
    }
    return out;
  }
  if (isObject(value)) {
    const out: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) out[key] = dedupeArrays(entry);
    return out;
  }
  return value;
}

/** Reconciles extractor output with the expected schema. */
export function parseWithSchema(value: unknown, schema: unknown): unknown {
  return dedupeArrays(sanitizeStrings(coerceNulls(remapKeys(value, schema), schema)));
}

/** Extracts the JSON from a model reply, then reconciles it with the schema. */
export function reconcile(raw: string, schema: JsonSchema): Record<string, unknown> {
  const parsed = extractJsonBlock(raw);
  const shaped = parseWithSchema(parsed, schema);
  return isObject(shaped) ? shaped : {};
}
