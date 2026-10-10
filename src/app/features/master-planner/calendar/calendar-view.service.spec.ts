import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { CalendarViewService } from './calendar-view.service';
import { CalendarCell, CalendarMode } from './calendar.util';
import { DateService } from '../../../core/date/date.service';
import { GlobalTrackingIntervalService } from '../../../core/global-tracking-interval/global-tracking-interval.service';
import { GlobalConfigService } from '../../config/global-config.service';
import { DateTimeFormatService } from '../../../core/date-time-format/date-time-format.service';
import { PlannerService } from '../../planner/planner.service';
import { MasterPlannerDataService } from '../../master-planner-data/master-planner-data.service';
import { WorkOrder } from '../../master-planner-data/master-planner-data.model';
import { orderFixture } from '../../master-planner-data/master-planner-data.test-helper';

describe('CalendarViewService', () => {
  const logicalToday = signal('2026-10-09');
  const orders = signal<WorkOrder[]>([]);
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
        { provide: MasterPlannerDataService, useValue: { getWorkOrders: () => orders } },
      ],
    });
    return TestBed.inject(CalendarViewService);
  };

  beforeEach(() => {
    orders.set([]);
    logicalToday.set('2026-10-09');
    params.next(convertToParamMap({}));
  });

  it('groups only scheduled visible orders and keeps completed appointments', () => {
    orders.set([
      { ...orderFixture('active'), scheduledDay: '2026-10-09' },
      { ...orderFixture('completed'), scheduledDay: '2026-10-09', status: 'completed' },
      { ...orderFixture('archived'), scheduledDay: '2026-10-09', archivedAt: 1 },
      { ...orderFixture('cancelled'), scheduledDay: '2026-10-09', status: 'cancelled' },
      orderFixture('undated'),
      { ...orderFixture('tomorrow'), scheduledDay: '2026-10-10' },
    ]);
    const calendar = setup('today');
    expect(
      calendar
        .ordersByDay()
        .get(calendar.anchor())
        ?.map((order) => order.id),
    ).toEqual(['active', 'completed']);
    expect(calendar.ordersByDay().get('2026-10-11')).toBeUndefined();
    orders.update((records) =>
      records.map((order) =>
        order.id === 'active' ? { ...order, scheduledDay: '2026-10-10' } : order,
      ),
    );
    expect(
      calendar
        .ordersByDay()
        .get(calendar.anchor())
        ?.map((order) => order.id),
    ).toEqual(['completed']);
    expect(calendar.ordersByDay().get('2026-10-10')?.length).toBe(2);
  });

  it('sorts week appointments by start time, with untimed orders last', () => {
    orders.set([
      { ...orderFixture('untimed'), scheduledDay: '2026-10-09' },
      { ...orderFixture('late'), scheduledDay: '2026-10-09', scheduledStart: 600 },
      { ...orderFixture('early'), scheduledDay: '2026-10-09', scheduledStart: 0 },
      { ...orderFixture('other'), scheduledDay: '2026-10-10' },
    ]);
    const calendar = setup('week');
    expect(calendar.requestedDates()).toContain('2026-10-09');
    expect(
      calendar
        .ordersByDay()
        .get('2026-10-09')
        ?.map((order) => order.id),
    ).toEqual(['early', 'late', 'untimed']);
    expect(calendar.ordersByDay().get('2026-10-10')?.length).toBe(1);
  });

  it('adds month counts and at most two work titles independently of Planner tasks', () => {
    orders.set(
      ['one', 'two', 'three'].map((id) => ({
        ...orderFixture(id),
        scheduledDay: '2026-10-09',
      })),
    );
    const calendar = setup('month');
    const cell = calendar.months()[0].cells.find((day) => day.dateStr === '2026-10-09');
    expect(cell?.workCount).toBe(3);
    expect(cell?.workTitles.length).toBe(2);
    expect(cell?.taskCount).toBe(0);
  });

  it('provides year indicators and removes them when an order is archived', () => {
    orders.set([{ ...orderFixture(), scheduledDay: '2026-10-09' }]);
    const calendar = setup('year');
    const cell = (): CalendarCell | undefined =>
      calendar.months()[9].cells.find((day) => day.dateStr === '2026-10-09');
    expect(cell()?.workCount).toBe(1);
    orders.update((records) => records.map((order) => ({ ...order, archivedAt: 1 })));
    expect(cell()?.workCount).toBe(0);
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
