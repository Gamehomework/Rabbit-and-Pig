/**
 * Lightweight JSON Schema validator for tool inputs.
 *
 * Covers the subset of JSON Schema actually used by tool inputSchemas:
 *   - required fields
 *   - type: string | number | boolean | array | object | integer
 *   - enum values
 *   - string: minLength, maxLength
 *   - number/integer: minimum, maximum
 *   - array: items (validates each element)
 *   - object: properties (validates nested keys)
 *
 * Returns { valid, errors } — never throws.
 */

import type { JsonSchema } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateToolInput(input: unknown, schema: JsonSchema, path = "input"): ValidationResult {
  const errors: string[] = [];
  validateValue(input, schema, path, errors);
  return { valid: errors.length === 0, errors };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function validateValue(value: unknown, schema: JsonSchema, path: string, errors: string[]): void {
  // type check
  if (schema.type !== undefined) {
    const typeErrors = checkType(value, schema.type as string | string[], path);
    if (typeErrors.length > 0) {
      errors.push(...typeErrors);
      // Don't try to validate further if the top-level type is wrong
      return;
    }
  }

  // enum check (works for any type)
  if (Array.isArray(schema.enum)) {
    if (!(schema.enum as unknown[]).includes(value)) {
      const allowed = (schema.enum as unknown[]).map((v) => JSON.stringify(v)).join(", ");
      errors.push(`${path}: must be one of [${allowed}], got ${JSON.stringify(value)}`);
    }
  }

  const type = schema.type as string | string[] | undefined;
  const resolvedType = Array.isArray(type) ? type[0] : type;

  if (resolvedType === "string") {
    validateString(value as string, schema, path, errors);
  } else if (resolvedType === "number" || resolvedType === "integer") {
    validateNumber(value as number, schema, path, errors);
  } else if (resolvedType === "array") {
    validateArray(value as unknown[], schema, path, errors);
  } else if (resolvedType === "object") {
    validateObject(value as Record<string, unknown>, schema, path, errors);
  }

  // top-level required (for object schema)
  if (resolvedType === "object" && Array.isArray(schema.required)) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required as string[]) {
      if (obj[key] === undefined || obj[key] === null) {
        errors.push(`${path}: missing required field "${key}"`);
      }
    }
  }
}

function checkType(value: unknown, type: string | string[], path: string): string[] {
  const types = Array.isArray(type) ? type : [type];
  const matches = types.some((t) => matchesType(value, t));
  if (!matches) {
    const received = value === null ? "null" : typeof value;
    return [`${path}: expected type ${types.join(" | ")}, got ${received}`];
  }
  return [];
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":  return typeof value === "string";
    case "number":  return typeof value === "number" && !Number.isNaN(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "array":   return Array.isArray(value);
    case "object":  return typeof value === "object" && value !== null && !Array.isArray(value);
    case "null":    return value === null;
    default:        return true; // unknown type: skip
  }
}

function validateString(value: string, schema: JsonSchema, path: string, errors: string[]): void {
  if (typeof schema.minLength === "number" && value.length < schema.minLength) {
    errors.push(`${path}: must be at least ${schema.minLength} characters, got ${value.length}`);
  }
  if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
    errors.push(`${path}: must be at most ${schema.maxLength} characters, got ${value.length}`);
  }
  if (typeof schema.pattern === "string") {
    const re = new RegExp(schema.pattern as string);
    if (!re.test(value)) {
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
    }
  }
}

function validateNumber(value: number, schema: JsonSchema, path: string, errors: string[]): void {
  if (typeof schema.minimum === "number" && value < schema.minimum) {
    errors.push(`${path}: must be >= ${schema.minimum}, got ${value}`);
  }
  if (typeof schema.maximum === "number" && value > schema.maximum) {
    errors.push(`${path}: must be <= ${schema.maximum}, got ${value}`);
  }
  if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
    errors.push(`${path}: must be > ${schema.exclusiveMinimum}, got ${value}`);
  }
  if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) {
    errors.push(`${path}: must be < ${schema.exclusiveMaximum}, got ${value}`);
  }
}

function validateArray(value: unknown[], schema: JsonSchema, path: string, errors: string[]): void {
  if (typeof schema.minItems === "number" && value.length < schema.minItems) {
    errors.push(`${path}: must have at least ${schema.minItems} items, got ${value.length}`);
  }
  if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
    errors.push(`${path}: must have at most ${schema.maxItems} items, got ${value.length}`);
  }
  if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
    for (let i = 0; i < value.length; i++) {
      validateValue(value[i], schema.items as JsonSchema, `${path}[${i}]`, errors);
    }
  }
}

function validateObject(value: Record<string, unknown>, schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.properties && typeof schema.properties === "object") {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (value[key] !== undefined) {
        validateValue(value[key], propSchema as JsonSchema, `${path}.${key}`, errors);
      }
    }
  }
}
