import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { TaskService } from '../tasks/task.service';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { T } from '../../t.const';
import { trimmedRequired, waitForCommittedValue } from './crm-ui.util';

@Component({
  selector: 'mp-create-work-order-task-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatFormField,
    MatLabel,
    MatError,
    MatInput,
    TranslatePipe,
  ],
  templateUrl: './create-work-order-task-dialog.component.html',
  styleUrl: './crm-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateWorkOrderTaskDialogComponent {
  private readonly _tasks = inject(TaskService);
  private readonly _injector = inject(Injector);
  private readonly _ref =
    inject<MatDialogRef<CreateWorkOrderTaskDialogComponent, string>>(MatDialogRef);
  private readonly _input = inject<{ workOrderId: string }>(MAT_DIALOG_DATA);
  readonly order = inject(MasterPlannerDataService).getWorkOrder(this._input.workOrderId);
  private readonly _all = toSignal(this._tasks.allTasks$, { initialValue: [] });
  private _createdId?: string;
  readonly T = T;
  readonly saving = signal(false);
  readonly failed = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({ title: ['', trimmedRequired] });

  async submit(): Promise<void> {
    if (this.saving() || !this.order() || this.order()?.archivedAt !== undefined) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.failed.set(false);
    this._ref.disableClose = true;
    this.form.disable();
    try {
      // Match the existing API creation pattern: an explicit dueDay key suppresses
      // implicit Today planning. This title-only form does not parse scheduling syntax.
      this._createdId ??= this._tasks.add(
        this.form.getRawValue().title.trim(),
        false,
        { dueDay: undefined },
        false,
        true,
      );
      if (!this._createdId?.trim()) throw new Error('Task ID unavailable');
      await waitForCommittedValue(
        this._all,
        (tasks) => tasks.some((task) => task.id === this._createdId),
        this._injector,
      );
      this._ref.close(this._createdId);
    } catch {
      this.failed.set(true);
    } finally {
      this.saving.set(false);
      this._ref.disableClose = false;
      this.form.enable();
    }
  }
  cancel(): void {
    if (!this.saving()) this._ref.close();
  }
}
