import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { CalendarViewService } from './calendar-view.service';
import { CalendarMode } from './calendar.util';
import { DateService } from '../../../core/date/date.service';
import { GlobalTrackingIntervalService } from '../../../core/global-tracking-interval/global-tracking-interval.service';
import { GlobalConfigService } from '../../config/global-config.service';
import { DateTimeFormatService } from '../../../core/date-time-format/date-time-format.service';
import { PlannerService } from '../../planner/planner.service';

describe('CalendarViewService', () => {
  const logicalToday = signal('2026-10-09');
  const params = new BehaviorSubject(convertToParamMap({}));
  const setup = (mode: CalendarMode): CalendarViewService => {
    TestBed.configureTestingModule({
      providers: [
        CalendarViewService,
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params,
            snapshot: { paramMap: params.value, data: { calendarMode: mode } },
          },
        },
        { provide: DateService, useValue: { todayStr: () => logicalToday() } },
        {
          provide: GlobalTrackingIntervalService,
          useValue: { todayDateStr: logicalToday },
        },
        {
          provide: GlobalConfigService,
          useValue: { localization: signal({ firstDayOfWeek: 1 }) },
        },
        { provide: DateTimeFormatService, useValue: { textLocale: signal('en-GB') } },
        { provide: PlannerService, useValue: { selectDays$: () => of([]) } },
      ],
    });
    return TestBed.inject(CalendarViewService);
  };

  beforeEach(() => {
    logicalToday.set('2026-10-09');
    params.next(convertToParamMap({}));
  });

  it('anchors today on the logical day and follows the logical day rollover', () => {
    const calendar = setup('today');
    expect(calendar.anchor()).toBe('2026-10-09');
    logicalToday.set('2026-10-10');
    expect(calendar.anchor()).toBe('2026-10-10');
    expect(calendar.current()).toEqual(['/day', '2026-10-10']);
  });

  it('anchors tomorrow relative to the logical day, not calendar midnight', () => {
    const calendar = setup('tomorrow');
    expect(calendar.anchor()).toBe('2026-10-10');
    logicalToday.set('2026-12-31');
    expect(calendar.anchor()).toBe('2027-01-01');
  });

  it('reacts to month route parameters and links across the year boundary', () => {
    params.next(convertToParamMap({ year: '2026', month: '12' }));
    const calendar = setup('month');
    expect(calendar.next()).toEqual(['/month', '2027', '1']);
    params.next(convertToParamMap({ year: '2024', month: '2' }));
    expect(calendar.requestedDates()).toContain('2024-02-29');
  });

  it('produces twelve mini-months and selects each date only once', () => {
    const calendar = setup('year');
    expect(calendar.months().length).toBe(12);
    expect(new Set(calendar.requestedDates()).size).toBe(
      calendar.requestedDates().length,
    );
    expect(calendar.previous()).toEqual(['/year', '2025']);
    expect(calendar.next()).toEqual(['/year', '2027']);
  });

  it('uses seven days and moves by a full week', () => {
    const calendar = setup('week');
    expect(calendar.requestedDates().length).toBe(7);
    expect(calendar.requestedDates()[0]).toBe('2026-10-05');
    expect(calendar.next()).toEqual(['/week', '2026-10-16']);
  });
});
