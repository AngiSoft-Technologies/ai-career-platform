/**
 * JSON-Schema normalisation for strict structured output.
 *
 * Providers' "strict JSON mode" rejects schemas LLM pipelines routinely
 * produce: union types, missing `type`, `oneOf`, dictionaries, bare property
 * maps, `additionalProperties` left open. A schema rejected mid-flight
 * surfaces as a warning on an otherwise-successful extraction, so the
 * normalisation happens **before** the request, and a schema we cannot
 * normalise is reported with a path-anchored message at the boundary.
 *
 * All functions are pure and non-mutating.
 */

type JsonSchemaObject = Record<string, unknown>;

const ALLOWED_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null",
]);

const UNSUPPORTED_KEYWORDS = [
  "allOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "dependentRequired",
  "dependentSchemas",
];

const RECOGNISED_KEYWORDS = new Set([
  "type",
  "properties",
  "items",
  "required",
  "additionalProperties",
  "enum",
  "description",
  "title",
  "default",
  "$defs",
  "definitions",
  "anyOf",
  "$ref",
  "format",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
]);

function isObject(value: unknown): value is JsonSchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lowercases `type`, converts `oneOf`→`anyOf`, infers missing types, closes objects. */
export function normalizeSchemaKeywords(schema: unknown, isRoot = true): unknown {
  if (!isObject(schema)) return schema;

  const out: JsonSchemaObject = { ...schema };

  // oneOf is unsupported in strict mode; anyOf is not.
  if (out.oneOf !== undefined && out.anyOf === undefined) {
    out.anyOf = out.oneOf;
  }
  delete out.oneOf;

  if (typeof out.type === "string") {
    out.type = out.type.toLowerCase();
  } else if (Array.isArray(out.type)) {
    const members = (out.type as unknown[]).filter(
      (entry): entry is string => typeof entry === "string",
    );
    // Strict mode has no union root; collapse to the first non-null member
    // and rely on `nullable` semantics instead.
    out.type = members.find((entry) => entry !== "null") ?? members[0] ?? "string";
    if (members.includes("null")) out.nullable = true;
  } else if (out.type === undefined) {
    // Infer from structure: properties → object, items → array.
    if (isObject(out.properties)) out.type = "object";
    else if (out.items !== undefined) out.type = "array";
    else if (isRoot && out.anyOf !== undefined) out.type = out.type ?? "string";
  }

  // Strict mode closes every object, so keys beyond `properties` never return.
  if (isObject(out.properties) && out.additionalProperties === undefined) {
    out.additionalProperties = false;
  }

  if (isObject(out.properties)) {
    const props: JsonSchemaObject = {};
    for (const [key, value] of Object.entries(out.properties)) {
      props[key] = normalizeSchemaKeywords(value, false);
    }
    out.properties = props;
  }
  if (out.items !== undefined) {
    out.items = normalizeSchemaKeywords(out.items, false);
  }
  if (Array.isArray(out.anyOf)) {
    out.anyOf = out.anyOf.map((branch) => normalizeSchemaKeywords(branch, false));
  }
  if (isObject(out.$defs)) {
    const defs: JsonSchemaObject = {};
    for (const [key, value] of Object.entries(out.$defs)) {
      defs[key] = normalizeSchemaKeywords(value, false);
    }
    out.$defs = defs;
  }

  return out;
}

/**
 * Value-shape check for "is this thing a schema?". A bare property map's
 * values are all schemas; a real schema's keyword values are strings, arrays
 * of strings, or booleans. Field names collide with keyword names ("title",
 * "description", "properties" are all common column names), so *shape* — not
 * the key name — is the discriminator.
 */
function looksLikeSchema(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (typeof value.type === "string") return true;
  if (Array.isArray(value.type)) return true;
  if (isObject(value.properties)) return true;
  if (value.items !== undefined) return true;
  if (typeof value.$ref === "string") return true;
  return false;
}

/**
 * Detects a schema that is *already* an object schema but written without a
 * `type` keyword (so it must not be mistaken for a bare property map).
 */
function isTypelessRootSchema(value: JsonSchemaObject): boolean {
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  for (const key of keys) {
    if (!RECOGNISED_KEYWORDS.has(key)) return false;
    // Ambiguous names count as keywords only when the value has the right shape.
    if (key === "title" || key === "description" || key === "format" || key === "pattern") {
      if (typeof value[key] !== "string") return false;
    }
    if (key === "required") {
      const required = value[key];
      if (!Array.isArray(required) || !required.every((entry) => typeof entry === "string")) {
        return false;
      }
    }
    if (key === "properties" || key === "$defs" || key === "definitions") {
      if (!isObject(value[key])) return false;
      // A field literally named "properties" holds a schema, whose `type` is a string.
      const inner = (value[key] as JsonSchemaObject).type;
      if (typeof inner === "string") return false;
    }
  }
  return true;
}

/** Detects a bare map of property-name → schema (no schema keywords at all). */
function isBareRootMap(value: JsonSchemaObject): boolean {
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  return keys.every((key) => looksLikeSchema(value[key]));
}

/**
 * Wraps a schema into a root object schema, converting a bare property map
 * when needed. Guards prevent misclassifying a schema that legitimately has a
 * field literally named `properties`.
 */
export function toRootSchema(schema: unknown): JsonSchemaObject {
  if (!isObject(schema)) {
    throw new Error("Schema must be an object");
  }

  if (schema.type === undefined) {
    if (isBareRootMap(schema)) {
      const wrapped: JsonSchemaObject = {
        type: "object",
        properties: schema,
        required: Object.keys(schema),
        additionalProperties: false,
      };
      return normalizeSchemaKeywords(wrapped, true) as JsonSchemaObject;
    }
    if (isTypelessRootSchema(schema)) {
      return normalizeSchemaKeywords({ ...schema, type: "object" }, true) as JsonSchemaObject;
    }
  }

  const normalised = normalizeSchemaKeywords(schema, true) as JsonSchemaObject;
  if (normalised.$defs !== undefined && isObject(normalised.$defs)) {
    // $defs are already hoisted for the root; nothing else to do.
  }
  return normalised;
}

/**
 * Returns a human-readable, path-anchored description of the first strict-mode
 * violation, or `null` when the schema is acceptable.
 */
export function findStrictSchemaViolation(schema: unknown, path = "$"): string | null {
  if (!isObject(schema)) return `Schema at "${path}" is not an object`;

  for (const keyword of UNSUPPORTED_KEYWORDS) {
    if (schema[keyword] !== undefined) {
      return `Unsupported keyword "${keyword}" at "${path}" (strict mode)`;
    }
  }

  const type = schema.type;
  if (typeof type === "string") {
    if (!ALLOWED_TYPES.has(type)) {
      return `Unsupported type "${type}" at "${path}"`;
    }
  } else if (type !== undefined && !Array.isArray(type)) {
    return `Field "type" at "${path}" must be a string`;
  }

  if (Array.isArray(type)) {
    return `Union type at "${path}" (strict mode requires a single type)`;
  }

  const root = path === "$";
  if (type === undefined && !root) {
    return `Missing "type" at "${path}"`;
  }
  if (root && type !== undefined && type !== "object" && type !== "array") {
    return `Root schema at "${path}" must be an object or array`;
  }

  if (type === "object") {
    const properties = schema.properties;
    if (!isObject(properties)) {
      if (schema.additionalProperties !== undefined) return null;
      return `Object at "${path}" needs "properties"`;
    }
    for (const [key, value] of Object.entries(properties)) {
      const violation = findStrictSchemaViolation(value, `${path}.${key}`);
      if (violation) return violation;
    }
  }

  if (type === "array") {
    const items = schema.items;
    if (items === undefined) {
      return `Array at "${path}" needs "items"`;
    }
    if (Array.isArray(items)) {
      return `Array at "${path}" has tuple items (strict mode needs a single schema)`;
    }
    return findStrictSchemaViolation(items, `${path}[]`);
  }

  return null;
}

/** Resolves `$ref` pointers against `$defs`, with cycle protection. */
export function dereferenceSchema(schema: unknown, root?: unknown): unknown {
  const rootSchema = root ?? schema;
  const seen = new WeakSet<object>();

  const resolve = (node: unknown): unknown => {
    if (!isObject(node)) return node;
    if (seen.has(node)) return node;
    seen.add(node);

    const ref = node.$ref;
    if (typeof ref === "string" && ref.startsWith("#/$defs/")) {
      const name = decodeURIComponent(ref.slice("#/$defs/".length));
      const defs = isObject(rootSchema) ? rootSchema.$defs : undefined;
      const definition = isObject(defs) ? defs[name] : undefined;
      if (definition !== undefined) return resolve(definition);
      return null;
    }

    const out: JsonSchemaObject = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = key === "$ref" ? undefined : resolve(value);
    }
    return out;
  };

  return resolve(schema);
}
