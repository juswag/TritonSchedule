export function getCourseCode(name: string): string {
  const match = name.match(/\b[A-Z]{2,5}\s*\d{1,3}[A-Z]?\b/i);
  return match?.[0].toUpperCase().replace(/([A-Z])(\d)/, "$1 $2") ?? name;
}
