import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, firstValueFrom, from, of, switchMap } from 'rxjs';
import { TaskService } from '../tasks/task.service';
import { Task } from '../tasks/task.model';
import { TaskArchiveService } from '../archive/task-archive.service';
import { DialogViewArchivedTaskComponent } from '../tasks/dialog-view-archived-task/dialog-view-archived-task.component';
import { NavigateToTaskService } from '../../core-ui/navigate-to-task/navigate-to-task.service';
import { SnackService } from '../../core/snack/snack.service';
import { DateTimeFormatService } from '../../core/date-time-format/date-time-format.service';
import { parseDbDateStr } from '../../util/parse-db-date-str';
import { T } from '../../t.const';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { WorkOrder } from '../master-planner-data/master-planner-data.model';
import { CRM_DIALOG_SIZE, waitForCommittedRecord } from './crm-ui.util';
import { normalizeWorkOrderTaskIds } from './work-order-task.util';
import { CreateWorkOrderTaskDialogComponent } from './create-work-order-task-dialog.component';
import { LinkWorkOrderTaskDialogComponent } from './link-work-order-task-dialog.component';

@Component({
  selector: 'mp-work-order-tasks',
  standalone: true,
  imports: [MatButton, TranslatePipe],
  templateUrl: './work-order-tasks.component.html',
  styleUrl: './crm-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkOrderTasksComponent {
  readonly order = input.required<WorkOrder>();
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _tasks = inject(TaskService);
  private readonly _archive = inject(TaskArchiveService);
  private readonly _navigate = inject(NavigateToTaskService);
  private readonly _dialog = inject(MatDialog);
  private readonly _snack = inject(SnackService);
  private readonly _format = inject(DateTimeFormatService);
  private readonly _injector = inject(Injector);
  private readonly _all = toSignal(this._tasks.allTasks$, { initialValue: [] });
  private readonly _live = computed(
    () => new Map(this._all().map((task) => [task.id, task])),
  );
  private readonly _ids = computed(() => normalizeWorkOrderTaskIds(this.order().taskIds));
  private readonly _missing = computed(() =>
    this._ids().filter((id) => !this._live().has(id)),
  );
  // Derived read-only archive query, never a CRM write or a second task store.
  private readonly _archived = toSignal(
    toObservable(this._missing).pipe(
      switchMap((ids) =>
        ids.length
          ? from(this._archive.getByIdBatch(ids)).pipe(
              catchError(() => of(new Map<string, Task>())),
            )
          : of(new Map<string, Task>()),
      ),
    ),
    { initialValue: new Map<string, Task>() },
  );
  readonly rows = computed(() =>
    this._ids().flatMap((id) => {
      const live = this._live().get(id);
      const task = live ?? this._archived().get(id);
      return task
        ? [
            {
              task,
              archived: !live,
              schedule:
                typeof task.dueWithTime !== 'number'
                  ? task.dueDay
                    ? this._format.formatDate(parseDbDateStr(task.dueDay))
                    : ''
                  : `${this._format.formatDate(new Date(task.dueWithTime))} ${this._format.formatTime(task.dueWithTime)}`,
            },
          ]
        : [];
    }),
  );
  readonly unavailable = computed(
    () =>
      this._ids().filter((id) => !this._live().has(id) && !this._archived().has(id))
        .length,
  );
  readonly readOnly = computed(() => this.order().archivedAt !== undefined);
  readonly busy = signal(false);
  readonly error = signal<'created' | 'link' | 'unlink' | null>(null);
  readonly T = T;

  async addTask(): Promise<void> {
    if (this.readOnly() || this.busy()) return;
    const id: unknown = await firstValueFrom(
      this._dialog
        .open(CreateWorkOrderTaskDialogComponent, {
          ...CRM_DIALOG_SIZE,
          data: { workOrderId: this.order().id },
        })
        .afterClosed(),
    );
    if (typeof id !== 'string' || !id.trim()) return;
    await this._link(id, true);
  }
  async linkExisting(): Promise<void> {
    if (this.readOnly() || this.busy()) return;
    const id: unknown = await firstValueFrom(
      this._dialog
        .open(LinkWorkOrderTaskDialogComponent, {
          ...CRM_DIALOG_SIZE,
          data: { workOrderId: this.order().id },
        })
        .afterClosed(),
    );
    if (typeof id === 'string' && id.trim()) await this._link(id, false);
  }
  async unlink(id: string): Promise<void> {
    if (this.readOnly() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this._saveLinks((ids) => ids.filter((linked) => linked !== id));
      this._snack.open(T.MASTER_PLANNER_CRM.TASK_UNLINKED);
    } catch {
      this.error.set('unlink');
    } finally {
      this.busy.set(false);
    }
  }
  async open(task: Task, archived: boolean): Promise<void> {
    if (archived) {
      this._dialog.open(DialogViewArchivedTaskComponent, { data: { task } });
    } else {
      await this._navigate.navigate(task.id);
      this._tasks.setSelectedId(task.id);
    }
  }
  private async _link(id: string, created: boolean): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      if (!this._live().has(id)) throw new Error('Task unavailable');
      await this._saveLinks((ids) => [...ids, id]);
    } catch {
      this.error.set(created ? 'created' : 'link');
    } finally {
      this.busy.set(false);
    }
  }
  private async _saveLinks(change: (ids: string[]) => string[]): Promise<void> {
    const query = this._data.getWorkOrder(this.order().id);
    const latest = query();
    if (!latest || latest.archivedAt !== undefined)
      throw new Error('Work order unavailable');
    const taskIds = normalizeWorkOrderTaskIds(
      change(normalizeWorkOrderTaskIds(latest.taskIds)),
    );
    if (
      taskIds.length === latest.taskIds.length &&
      taskIds.every((id, index) => id === latest.taskIds[index])
    )
      return;
    await this._data.saveWorkOrder({ ...latest, taskIds });
    await waitForCommittedRecord(
      query,
      (saved) =>
        saved.taskIds.length === taskIds.length &&
        saved.taskIds.every((id, index) => id === taskIds[index]),
      this._injector,
    );
  }
}
