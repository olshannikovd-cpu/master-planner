import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { PlannerDay } from '../../planner/planner.model';
import { WorkOrder } from '../../master-planner-data/master-planner-data.model';
import { WorkOrderRowsComponent } from '../../master-planner-crm/work-order-rows.component';
import { TranslatePipe } from '@ngx-translate/core';
import { T } from '../../../t.const';
import { PlannerDayComponent } from '../../planner/planner-day/planner-day.component';
import { PlannerDayOverdueComponent } from '../../planner/planner-day-overdue/planner-day-overdue.component';
import {
  selectUndoneOverdue,
  selectUndoneOverdueDeadlineTasks,
} from '../../tasks/store/task.selectors';

@Component({
  selector: 'mp-day-view',
  standalone: true,
  imports: [
    CdkDropListGroup,
    CdkScrollable,
    PlannerDayComponent,
    PlannerDayOverdueComponent,
    WorkOrderRowsComponent,
    TranslatePipe,
  ],
  templateUrl: './day-view.component.html',
  styleUrl: './day-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayViewComponent {
  private readonly _store = inject(Store);
  readonly days = input.required<PlannerDay[]>();
  readonly isWeek = input(false);
  readonly ordersByDay = input<ReadonlyMap<string, readonly WorkOrder[]>>(new Map());
  readonly T = T;
  readonly includesToday = computed(() => this.days().some((day) => day.isToday));
  readonly overdue = toSignal(this._store.select(selectUndoneOverdue), {
    initialValue: [],
  });
  readonly overdueDeadlines = toSignal(
    this._store.select(selectUndoneOverdueDeadlineTasks),
    { initialValue: [] },
  );
}
