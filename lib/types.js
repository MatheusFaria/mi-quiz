import { ValidationError } from "./errors.js";

export const isEmpty = (v) => v === undefined || v === null || v === "";

const fail = (type, v) => {
  throw new ValidationError(`Expected ${type}, got ${JSON.stringify(v)}`);
};

const TYPES = {
  string: { read: String, write: String },
  number: {
    read: (v) => (Number.isNaN(Number(v)) ? fail("number", v) : Number(v)),
    write: (v) => (typeof v === "number" && Number.isFinite(v) ? v : fail("number", v)),
  },
  boolean: {
    read: (v) => v === true || String(v).toLowerCase() === "true",
    write: (v) => (typeof v === "boolean" ? v : fail("boolean", v)),
  },
  date: {
    read: String,
    write: (v) => {
      const iso = v instanceof Date ? v.toISOString() : String(v);
      return Number.isNaN(Date.parse(iso)) ? fail("date", v) : iso;
    },
  },
  json: { read: (v) => JSON.parse(v), write: (v) => JSON.stringify(v) },
};

export function checkType(type) {
  if (!Object.hasOwn(TYPES, type)) throw new ValidationError(`Unknown column type "${type}"`);
}

export const readCell = (type, v) => (isEmpty(v) ? null : TYPES[type].read(v));

export const writeCell = (type, v) => (v === null || v === undefined ? "" : TYPES[type].write(v));
