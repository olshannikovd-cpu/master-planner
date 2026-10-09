import {
  calendarDateFromRoute,
  getCalendarMonth,
  getCalendarWeek,
  shiftCalendarDay,
  shiftCalendarMonth,
  shiftCalendarYear,
  summarizePlannerDay,
} from './calendar.util';
import { PlannerDay, ScheduleItemType } from '../../planner/planner.model';
import { TaskCopy } from '../../tasks/task.model';
import { DEFAULT_TASK } from '../../tasks/task.model';
import { DEFAULT_TASK_REPEAT_CFG } from '../../task-repeat-cfg/task-repeat-cfg.model';

describe('Master Planner calendar arithmetic', () => {
  it('uses the configured first weekday and returns seven consecutive dates', () => {
    expect(getCalendarWeek('2026-10-10', 1)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(getCalendarWeek('2026-10-10', 0)[0]).toBe('2026-10-04');
  });

  it('fills month grids from the first week through the last week', () => {
    const grid = getCalendarMonth('2026-10-01', 1);
    expect(grid.length).toBe(35);
    expect(grid[0]).toBe('2026-09-28');
    expect(grid[34]).toBe('2026-11-01');
    expect(new Set(grid).size).toBe(grid.length);
  });

  it('supports four and six week months', () => {
    expect(getCalendarMonth('2021-02-01', 1).length).toBe(28);
    expect(getCalendarMonth('2026-03-01', 1).length).toBe(42);
  });

  it('includes February 29 only in leap years, including the century rule', () => {
    expect(getCalendarMonth('2024-02-01', 1)).toContain('2024-02-29');
    expect(getCalendarMonth('2025-02-01', 1)).not.toContain('2025-02-29');
    expect(getCalendarMonth('2000-02-01', 1)).toContain('2000-02-29');
    expect(getCalendarMonth('2100-02-01', 1)).not.toContain('2100-02-29');
  });

  it('navigates between December and January without month overflow', () => {
    expect(shiftCalendarMonth('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftCalendarMonth('2027-01-31', -1)).toBe('2026-12-01');
  });

  it('navigates whole years from a leap day', () => {
    expect(shiftCalendarYear('2024-02-29', 1)).toBe('2025-01-01');
    expect(shiftCalendarYear('2024-02-29', -1)).toBe('2023-01-01');
  });

  it('advances calendar days across DST dates without skipping or duplicating', () => {
    expect(shiftCalendarDay('2026-03-29', 1)).toBe('2026-03-30');
    expect(shiftCalendarDay('2026-10-25', 1)).toBe('2026-10-26');
    expect(shiftCalendarDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('falls back for malformed and impossible date URLs', () => {
    expect(calendarDateFromRoute('2026-02-30', '2026-10-10')).toBe('2026-10-10');
    expect(calendarDateFromRoute('invalid', '2026-10-10')).toBe('2026-10-10');
    expect(calendarDateFromRoute('2024-02-29', '2026-10-10')).toBe('2024-02-29');
  });
});

describe('Master Planner day summaries', () => {
  it('counts a timed/deadline task once and includes repeat projections and events', () => {
    const task: TaskCopy = {
      ...DEFAULT_TASK,
      id: 'task',
      title: 'Repair',
      projectId: 'project',
    };
    const repeatCfg = { ...DEFAULT_TASK_REPEAT_CFG, id: 'repeat', title: 'Inspection' };
    const day: PlannerDay = {
      dayDate: '2026-10-10',
      timeEstimate: 0,
      timeLimit: 0,
      itemsTotal: 2,
      tasks: [task],
      deadlineTasks: [task],
      noStartTimeRepeatProjections: [{ id: 'repeat', repeatCfg }],
      allDayEvents: [],
      scheduledIItems: [
        { id: 'task', type: ScheduleItemType.Task, task, start: 0, end: 1 },
        {
          id: 'event',
          type: ScheduleItemType.CalEvent,
          start: 0,
          end: 1,
          calendarEvent: { title: 'Visit', duration: 1 },
        },
      ],
    };
    expect(summarizePlannerDay(day)).toEqual({
      taskCount: 2,
      eventCount: 1,
      titles: ['Repair', 'Inspection'],
    });
    expect(day.tasks).toEqual([task]);
  });

  it('returns an empty summary while the planner is loading', () => {
    expect(summarizePlannerDay(undefined)).toEqual({
      taskCount: 0,
      eventCount: 0,
      titles: [],
    });
  });
});
