import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CalendarCell } from '../calendar/calendar.util';
import { T } from '../../../t.const';

@Component({
  selector: 'mp-month-grid',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './month-grid.component.html',
  styleUrl: './month-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthGridComponent {
  readonly cells = input.required<CalendarCell[]>();
  readonly weekdays = input.required<string[]>();
  readonly compact = input(false);
  readonly T = T;
}
