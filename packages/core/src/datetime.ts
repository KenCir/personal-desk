export const timeZone = 'Asia/Tokyo';
/** PostgreSQL timestamps retain microseconds; Date.parse alone truncates them. */
export function compareInstants(a: string, b: string) {
  const micros = (value: string) =>
    Number((value.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
  return Date.parse(a) - Date.parse(b) || micros(a) - micros(b);
}
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export const formatDate = (value: string | Date) => dateFormatter.format(new Date(value));
export const formatTime = (value: string | Date) => timeFormatter.format(new Date(value));
export const formatDateTime = (value: string | Date) => `${formatDate(value)} ${formatTime(value)}`;
export const dateKey = (value: string | Date) => formatDate(value).replaceAll('/', '-');
export function dayDifference(value: string, now: string) {
  return Math.round(
    (Date.parse(`${dateKey(value)}T00:00:00+09:00`) -
      Date.parse(`${dateKey(now)}T00:00:00+09:00`)) /
      86_400_000,
  );
}
export function dateGroup(value: string, now: string): 'today' | 'yesterday' | string {
  const days = dayDifference(value, now);
  return days === 0 ? 'today' : days === -1 ? 'yesterday' : formatDate(value);
}
