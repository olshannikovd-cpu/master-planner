import { getDbDateStr } from '../../../util/get-db-date-str';
import { parseDbDateStr } from '../../../util/parse-db-date-str';
import { getWeekRange } from '../../../util/get-week-range';
import { getDateRangeForMonth } from '../../../util/get-date-range-for-month';
import { PlannerDay, ScheduleItemType } from '../../planner/planner.model';

export type CalendarMode = 'today' | 'tomorrow' | 'day' | 'week' | 'month' | 'year';

export interface CalendarCell {
  dateStr: string;
  date: Date;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  taskCount: number;
  eventCount: number;
  titles: string[];
}

// Calendar arithmetic uses local noon: adding 24h skips/repeats dates at DST,
// and midnight can fall inside a timezone transition.
export const shiftCalendarDay = (dateStr: string, days: number): string => {
  const date = parseDbDateStr(dateStr);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return getDbDateStr(date);
};

export const shiftCalendarMonth = (dateStr: string, months: number): string => {
  const date = parseDbDateStr(dateStr);
  date.setHours(12, 0, 0, 0);
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  return getDbDateStr(date);
};

export const shiftCalendarYear = (dateStr: string, years: number): string => {
  const date = parseDbDateStr(dateStr);
  date.setHours(12, 0, 0, 0);
  date.setMonth(0, 1);
  date.setFullYear(date.getFullYear() + years);
  return getDbDateStr(date);
};

export const calendarDateFromRoute = (
  dateStr: string | null,
  fallback: string,
): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return fallback;
  }
  const parsed = parseDbDateStr(dateStr);
  return getDbDateStr(parsed) === dateStr ? dateStr : fallback;
};

export const getCalendarWeek = (dateStr: string, firstDay: number): string[] => {
  const date = parseDbDateStr(dateStr);
  // getWeekRange expects the calendar date on the UTC axis and compensates
  // for the local offset itself. Do not give it a local-midnight timestamp.
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const start = getDbDateStr(getWeekRange(utcDate, firstDay).start);
  return Array.from({ length: 7 }, (_, i) => shiftCalendarDay(start, i));
};

export const getCalendarMonth = (dateStr: string, firstDay: number): string[] => {
  const date = parseDbDateStr(dateStr);
  const { rangeStart, rangeEnd } = getDateRangeForMonth(
    date.getFullYear(),
    date.getMonth() + 1,
  );
  const start = getCalendarWeek(getDbDateStr(rangeStart), firstDay)[0];
  const end = getCalendarWeek(getDbDateStr(rangeEnd), firstDay)[6];
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = shiftCalendarDay(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
};

export const summarizePlannerDay = (
  day: PlannerDay | undefined,
): Pick<CalendarCell, 'taskCount' | 'eventCount' | 'titles'> => {
  if (!day) {
    return { taskCount: 0, eventCount: 0, titles: [] };
  }
  // A timed task can also appear in tasks, and a deadline can refer to the
  // same task: count each real task once, without changing its stored model.
  const tasks = new Map(day.tasks.map((task) => [task.id, task.title]));
  const repeats = new Map(
    day.noStartTimeRepeatProjections.map((projection) => [
      projection.id,
      projection.repeatCfg.title,
    ]),
  );
  let eventCount = day.allDayEvents.length;
  for (const item of day.scheduledIItems) {
    switch (item.type) {
      case ScheduleItemType.Task:
        tasks.set(item.task.id, item.task.title);
        break;
      case ScheduleItemType.RepeatProjection:
        repeats.set(item.id, item.repeatCfg.title);
        break;
      case ScheduleItemType.CalEvent:
        eventCount++;
        break;
    }
  }
  for (const task of day.deadlineTasks) {
    tasks.set(task.id, task.title);
  }
  return {
    taskCount: tasks.size + repeats.size,
    eventCount,
    titles: [...tasks.values(), ...repeats.values()]
      .filter((title): title is string => title !== null)
      .slice(0, 3),
  };
};
