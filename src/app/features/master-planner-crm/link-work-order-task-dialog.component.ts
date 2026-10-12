import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatCheckbox } from '@angular/material/checkbox';
import { TranslatePipe } from '@ngx-translate/core';
import { TaskService } from '../tasks/task.service';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { T } from '../../t.const';
import { matchesCrmSearch } from './crm-ui.util';

@Component({
  selector: 'mp-link-work-order-task-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatCheckbox,
    TranslatePipe,
  ],
  templateUrl: './link-work-order-task-dialog.component.html',
  styleUrls: ['./crm-page.scss', './crm-form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkWorkOrderTaskDialogComponent {
  private readonly _ref =
    inject<MatDialogRef<LinkWorkOrderTaskDialogComponent, string>>(MatDialogRef);
  private readonly _input = inject<{ workOrderId: string }>(MAT_DIALOG_DATA);
  private readonly _all = toSignal(inject(TaskService).allTasks$, { initialValue: [] });
  readonly order = inject(MasterPlannerDataService).getWorkOrder(this._input.workOrderId);
  readonly search = signal('');
  readonly showCompleted = signal(false);
  readonly canLink = computed(
    () => !!this.order() && this.order()?.archivedAt === undefined,
  );
  readonly tasks = computed(() => {
    const linked = new Set(this.order()?.taskIds ?? []);
    return this._all().filter(
      (task) =>
        !linked.has(task.id) &&
        (this.showCompleted() || !task.isDone) &&
        matchesCrmSearch([task.title], this.search()),
    );
  });
  readonly T = T;
  select(id: string): void {
    if (this.canLink() && this.tasks().some((task) => task.id === id))
      this._ref.close(id);
  }
  cancel(): void {
    this._ref.close();
  }
}
