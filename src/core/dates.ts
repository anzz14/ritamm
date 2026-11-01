import { ParseError } from "./errors.js";

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
};

export type IsoDate = `${number}-${number}-${number}`;

export function parseStatementDate(value: string): IsoDate {
  const match = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(value.trim());
  const day = match?.[1];
  const month = match?.[2];
  const year = match?.[3];
  const monthNumber = month ? MONTHS[month[0]?.toUpperCase() + month.slice(1).toLowerCase()] : undefined;
  if (!day || !monthNumber || !year) {
    throw new ParseError(`Invalid statement date: ${value}`);
  }

  const dayNumber = Number(day);
  const yearNumber = Number(year);
  const daysInMonth = monthNumber === "02"
    ? yearNumber % 4 === 0 && (yearNumber % 100 !== 0 || yearNumber % 400 === 0) ? 29 : 28
    : ["04", "06", "09", "11"].includes(monthNumber) ? 30 : 31;
  if (dayNumber < 1 || dayNumber > daysInMonth) {
    throw new ParseError(`Invalid statement date: ${value}`);
  }
  return `${year}-${monthNumber}-${day.padStart(2, "0")}` as IsoDate;
}

export function isoFromUtcDate(value: Date): IsoDate {
  if (Number.isNaN(value.getTime())) {
    throw new ParseError("Invalid UTC date");
  }
  const year = value.getUTCFullYear().toString().padStart(4, "0");
  const month = (value.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = value.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}` as IsoDate;
}

export function isIsoDate(value: string): value is IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ?? [];
  if (!year || !month || !day) {
    return false;
  }
  try {
    parseStatementDate(`${day} ${Object.keys(MONTHS).find((key) => MONTHS[key] === month)} ${year}`);
    return true;
  } catch {
    return false;
  }
}