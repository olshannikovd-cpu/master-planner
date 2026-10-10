/** Wall-clock minutes from local midnight, independent of timestamps and DST. */
export const isWorkOrderTimeRange = (start: unknown, end: unknown): boolean => {
  const valid = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
  return (
    (start === undefined || valid(start, 0, 1439)) &&
    (end === undefined || valid(end, 1, 1440)) &&
    (typeof start !== 'number' || typeof end !== 'number' || end > start)
  );
};

export const parseWorkOrderTime = (value: string, isEnd = false): number | null => {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes !== 0)) return null;
  const hourMinutes = hours * 60;
  const result = hourMinutes + minutes;
  return (
    isEnd
      ? isWorkOrderTimeRange(undefined, result)
      : isWorkOrderTimeRange(result, undefined)
  )
    ? result
    : null;
};

export const formatWorkOrderTime = (minutes: number | undefined): string =>
  minutes === undefined
    ? ''
    : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
