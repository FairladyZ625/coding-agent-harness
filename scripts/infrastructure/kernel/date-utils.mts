export const datePrefix = /^\d{4}-\d{2}-\d{2}-/;

export function todayDate() {
  return localDate();
}

export function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function nowTimestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 16);
}
