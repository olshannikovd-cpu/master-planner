import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CalendarCell } from '../calendar/calendar.util';
import { MonthGridComponent } from './month-grid.component';

describe('Calendar work indicators', () => {
  const cell: CalendarCell = {
    dateStr: '2026-10-10',
    date: new Date(2026, 9, 10),
    dayNumber: 10,
    inMonth: true,
    isToday: true,
    taskCount: 0,
    eventCount: 0,
    titles: [],
    workCount: 2,
    workTitles: ['Repair', 'Visit'],
  };
  const setup = (compact: boolean): ComponentFixture<MonthGridComponent> => {
    TestBed.configureTestingModule({
      imports: [MonthGridComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      MASTER_PLANNER_CRM: {
        WORK_COUNT: 'Works: {{count}}',
        CALENDAR_DAY_SUMMARY: '{{date}}: {{tasks}} tasks, {{works}} work orders',
      },
    });
    translate.use('en');
    const fixture = TestBed.createComponent(MonthGridComponent);
    fixture.componentRef.setInput('cells', [cell]);
    fixture.componentRef.setInput('weekdays', [
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    return fixture;
  };
  it('renders month work counts, short titles and an accessible day link', () => {
    const element: HTMLElement = setup(false).nativeElement;
    expect(element.querySelector('.work-count')?.textContent).toContain('Works: 2');
    expect(element.querySelectorAll('.task-title').length).toBe(2);
    expect(
      element.querySelector('a[href="/day/2026-10-10"]')?.getAttribute('aria-label'),
    ).toContain('2 work orders');
  });
  it('renders a distinct year indicator without task dots or work titles and removes it at zero', () => {
    const fixture = setup(true);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('.work-indicator').length).toBe(1);
    expect(element.querySelectorAll('.indicator').length).toBe(0);
    expect(element.querySelectorAll('.task-title').length).toBe(0);
    fixture.componentRef.setInput('cells', [{ ...cell, workCount: 0, workTitles: [] }]);
    fixture.detectChanges();
    expect(element.querySelectorAll('.work-indicator').length).toBe(0);
  });
});
