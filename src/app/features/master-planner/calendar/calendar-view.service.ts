import { computed, inject, Injectable } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DateService } from '../../../core/date/date.service';
import { GlobalTrackingIntervalService } from '../../../core/global-tracking-interval/global-tracking-interval.service';
import { DateTimeFormatService } from '../../../core/date-time-format/date-time-format.service';
import { DEFAULT_FIRST_DAY_OF_WEEK } from '../../../core/locale.constants';
import { GlobalConfigService } from '../../config/global-config.service';
import { PlannerService } from '../../planner/planner.service';
import { parseDbDateStr } from '../../../util/parse-db-date-str';
import { getWeekdaysMin } from '../../../util/get-weekdays-min';
import { T } from '../../../t.const';
import {
  CalendarCell,
  CalendarMode,
  calendarDateFromRoute,
  getCalendarMonth,
  getCalendarWeek,
  shiftCalendarDay,
  shiftCalendarMonth,
  shiftCalendarYear,
  summarizePlannerDay,
} from './calendar.util';

@Injectable()
export class CalendarViewService {
  private readonly _route = inject(ActivatedRoute);
  private readonly _dateService = inject(DateService);
  private readonly _tracking = inject(GlobalTrackingIntervalService);
  private readonly _config = inject(GlobalConfigService);
  private readonly _format = inject(DateTimeFormatService);
  private readonly _planner = inject(PlannerService);
  private readonly _params = toSignal(this._route.paramMap, {
    initialValue: this._route.snapshot.paramMap,
  });

  readonly mode = this._route.snapshot.data['calendarMode'] as CalendarMode;
  readonly today = this._tracking.todayDateStr;
  readonly firstDay = computed(
    () => this._config.localization()?.firstDayOfWeek ?? DEFAULT_FIRST_DAY_OF_WEEK,
  );
  readonly anchor = computed(() => {
    const today = this.today();
    const params = this._params();
    switch (this.mode) {
      case 'today':
        return today;
      case 'tomorrow':
        return shiftCalendarDay(today, 1);
      case 'month':
        return calendarDateFromRoute(
          params.get('year') && params.get('month')
            ? `${params.get('year')}-${params.get('month')?.padStart(2, '0')}-01`
            : null,
          shiftCalendarMonth(today, 0),
        );
      case 'year':
        return calendarDateFromRoute(
          params.get('year') ? `${params.get('year')}-01-01` : null,
          shiftCalendarYear(today, 0),
        );
      default:
        return calendarDateFromRoute(params.get('date'), today);
    }
  });
  readonly monthDates = computed(() =>
    this.mode === 'year'
      ? Array.from({ length: 12 }, (_, month) => shiftCalendarMonth(this.anchor(), month))
      : [this.anchor()],
  );
  readonly grids = computed(() =>
    this.monthDates().map((month) => getCalendarMonth(month, this.firstDay())),
  );
  readonly requestedDates = computed(() => {
    if (this.mode === 'week') {
      return getCalendarWeek(this.anchor(), this.firstDay());
    }
    if (this.mode === 'month' || this.mode === 'year') {
      return [...new Set(this.grids().flat())];
    }
    return [this.anchor()];
  });
  readonly days = toSignal(this._planner.selectDays$(toObservable(this.requestedDates)), {
    initialValue: [],
  });
  readonly weekdayLabels = computed(() => {
    const labels = getWeekdaysMin(this._format.textLocale());
    return Array.from({ length: 7 }, (_, i) => labels[(this.firstDay() + i) % 7]);
  });
  readonly months = computed(() => {
    const dayMap = new Map(this.days().map((day) => [day.dayDate, day]));
    const today = this.today();
    return this.grids().map((grid, index) => {
      const monthDate = this.monthDates()[index];
      return {
        date: parseDbDateStr(monthDate),
        link: this.linkFor(monthDate, 'month'),
        cells: grid.map(
          (dateStr): CalendarCell => ({
            dateStr,
            date: parseDbDateStr(dateStr),
            dayNumber: parseDbDateStr(dateStr).getDate(),
            inMonth: dateStr.slice(0, 7) === monthDate.slice(0, 7),
            isToday: dateStr === today,
            ...summarizePlannerDay(dayMap.get(dateStr)),
          }),
        ),
      };
    });
  });
  readonly title = computed(() => {
    const keys = T.MASTER_PLANNER;
    return {
      today: keys.TODAY,
      tomorrow: keys.TOMORROW,
      day: keys.DAY,
      week: keys.WEEK,
      month: keys.MONTH,
      year: keys.YEAR,
    }[this.mode];
  });
  readonly date = computed(() => parseDbDateStr(this.anchor()));
  readonly weekEnd = computed(() => parseDbDateStr(this.requestedDates()[6]));
  readonly previous = computed(() => this._offsetLink(-1));
  readonly next = computed(() => this._offsetLink(1));
  readonly current = computed(() => {
    this.today();
    return this.linkFor(this._dateService.todayStr());
  });
  readonly currentLabel = computed(() =>
    this.mode === 'month'
      ? T.MASTER_PLANNER.CURRENT_MONTH
      : this.mode === 'year'
        ? T.MASTER_PLANNER.CURRENT_YEAR
        : T.MASTER_PLANNER.TODAY,
  );

  linkFor(dateStr: string, mode: CalendarMode = this.mode): string[] {
    const date = parseDbDateStr(dateStr);
    if (mode === 'month') {
      return ['/month', `${date.getFullYear()}`, `${date.getMonth() + 1}`];
    }
    if (mode === 'year') {
      return ['/year', `${date.getFullYear()}`];
    }
    return mode === 'week' ? ['/week', dateStr] : ['/day', dateStr];
  }

  private _offsetLink(offset: number): string[] {
    const anchor = this.anchor();
    const date =
      this.mode === 'year'
        ? shiftCalendarYear(anchor, offset)
        : this.mode === 'month'
          ? shiftCalendarMonth(anchor, offset)
          : shiftCalendarDay(anchor, offset * (this.mode === 'week' ? 7 : 1));
    return this.linkFor(date);
  }
}
