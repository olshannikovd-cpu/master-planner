import {
  formatWorkOrderTime,
  isWorkOrderTimeRange,
  parseWorkOrderTime,
} from './work-order-time.util';

describe('Work order local minutes', () => {
  it('converts HH:mm to integer minutes without using dates', () => {
    expect(parseWorkOrderTime('09:30')).toBe(570);
    expect(parseWorkOrderTime('17:00')).toBe(1020);
    expect(parseWorkOrderTime('00:00')).toBe(0);
    expect(parseWorkOrderTime('23:59')).toBe(1439);
  });
  it('allows 24:00 only for an end time and rejects midnight as an end', () => {
    expect(parseWorkOrderTime('24:00', true)).toBe(1440);
    expect(parseWorkOrderTime('24:00')).toBeNull();
    expect(parseWorkOrderTime('00:00', true)).toBeNull();
  });
  it('rejects malformed and out-of-range clock values', () => {
    for (const value of [
      '',
      '9:30',
      '09:60',
      '24:01',
      '25:00',
      '-1:00',
      '09:30:00',
      ' 09:30 ',
    ])
      expect(parseWorkOrderTime(value)).withContext(value).toBeNull();
  });
  it('formats zero, normal minutes, and the end of the day', () => {
    expect(formatWorkOrderTime(0)).toBe('00:00');
    expect(formatWorkOrderTime(570)).toBe('09:30');
    expect(formatWorkOrderTime(1440)).toBe('24:00');
    expect(formatWorkOrderTime(undefined)).toBe('');
  });
  it('rejects equal/inverted times, fractions and invalid individual ranges', () => {
    for (const [start, end] of [
      [570, 570],
      [570, 569],
      [-1, 600],
      [1440, undefined],
      [undefined, 0],
      [undefined, 1441],
      [0.5, 2],
      [NaN, 10],
    ])
      expect(isWorkOrderTimeRange(start, end)).toBeFalse();
    expect(isWorkOrderTimeRange(undefined, undefined)).toBeTrue();
    expect(isWorkOrderTimeRange(0, 1440)).toBeTrue();
  });
});
