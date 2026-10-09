import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { CalendarViewService } from './calendar-view.service';
import { DayViewComponent } from '../day-view/day-view.component';
import { MonthGridComponent } from '../month-view/month-grid.component';
import { LocaleDatePipe } from '../../../ui/pipes/locale-date.pipe';
import { DateTimeFormatService } from '../../../core/date-time-format/date-time-format.service';
import { T } from '../../../t.const';

@Component({
  selector: 'mp-calendar-page',
  standalone: true,
  imports: [
    RouterLink,
    MatButton,
    MatIconButton,
    MatIcon,
    TranslatePipe,
    DayViewComponent,
    MonthGridComponent,
    LocaleDatePipe,
  ],
  providers: [CalendarViewService],
  templateUrl: './calendar-page.component.html',
  styleUrl: './calendar-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPageComponent {
  readonly calendar = inject(CalendarViewService);
  readonly format = inject(DateTimeFormatService);
  readonly T = T;
}
