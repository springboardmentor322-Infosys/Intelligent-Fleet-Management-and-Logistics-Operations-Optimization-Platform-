export function formatISTTimestamp(timestamp) {
  if (!timestamp) return "—";

  const value =
    typeof timestamp === "string" &&
    !/[zZ]$|[+-]\d{2}:\d{2}$/.test(timestamp)
      ? `${timestamp}Z`
      : timestamp;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}