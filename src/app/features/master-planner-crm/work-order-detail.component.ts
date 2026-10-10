import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { T } from '../../t.const';
import { DialogConfirmComponent } from '../../ui/dialog-confirm/dialog-confirm.component';
import { LocaleDatePipe } from '../../ui/pipes/locale-date.pipe';
import { DateTimeFormatService } from '../../core/date-time-format/date-time-format.service';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { WorkOrderStatus } from '../master-planner-data/master-planner-data.model';
import { WorkOrderFormDialogComponent } from './work-order-form-dialog.component';
import { CRM_DIALOG_SIZE, waitForCommittedRecord } from './crm-ui.util';
import {
  withWorkOrderStatus,
  workOrderTimeLabel,
  WORK_ORDER_STATUS_LABELS,
} from './work-order-ui.util';

@Component({
  selector: 'mp-work-order-detail',
  standalone: true,
  imports: [RouterLink, MatButton, TranslatePipe, LocaleDatePipe],
  templateUrl: './work-order-detail.component.html',
  styleUrl: './crm-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkOrderDetailComponent {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _dialog = inject(MatDialog);
  private readonly _injector = inject(Injector);
  private readonly _format = inject(DateTimeFormatService);
  private readonly _params = toSignal(this._route.paramMap, {
    initialValue: this._route.snapshot.paramMap,
  });
  private readonly _record = computed(() =>
    this._data.getWorkOrder(this._params().get('id') ?? ''),
  );
  private readonly _owner = computed(() =>
    this._data.getCustomer(this.order()?.customerId ?? ''),
  );
  private readonly _site = computed(() =>
    this._data.getWorkSite(this.order()?.workSiteId ?? ''),
  );
  readonly order = computed(() => this._record()());
  readonly customer = computed(() => this._owner()());
  readonly site = computed(() => this._site()());
  readonly time = computed(() => (this.order() ? workOrderTimeLabel(this.order()!) : ''));
  readonly price = computed(() =>
    this.order()?.workPrice === undefined
      ? undefined
      : new Intl.NumberFormat(this._format.currentLocale()).format(
          this.order()!.workPrice!,
        ),
  );
  readonly T = T;
  readonly statusLabels = WORK_ORDER_STATUS_LABELS;
  readonly busy = signal(false);
  readonly failed = signal(false);

  async edit(): Promise<void> {
    const order = this.order();
    if (order)
      await firstValueFrom(
        this._dialog
          .open(WorkOrderFormDialogComponent, { ...CRM_DIALOG_SIZE, data: { order } })
          .afterClosed(),
      );
  }

  async changeStatus(status: WorkOrderStatus): Promise<void> {
    const order = this.order();
    if (
      !order ||
      order.archivedAt !== undefined ||
      order.status === status ||
      this.busy()
    )
      return;
    this.busy.set(true);
    this.failed.set(false);
    try {
      const updated = withWorkOrderStatus(order, status);
      await this._data.saveWorkOrder(updated);
      await waitForCommittedRecord(
        this._data.getWorkOrder(order.id),
        (saved) => saved.status === status && saved.completedAt === updated.completedAt,
        this._injector,
      );
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  async archive(): Promise<void> {
    const order = this.order();
    if (!order || order.archivedAt !== undefined || this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    try {
      const confirmed = await firstValueFrom(
        this._dialog
          .open(DialogConfirmComponent, {
            data: {
              title: T.MASTER_PLANNER_CRM.ARCHIVE_WORK_ORDER,
              message: T.MASTER_PLANNER_CRM.ARCHIVE_WORK_ORDER_CONFIRM,
              okTxt: T.MASTER_PLANNER_CRM.ARCHIVE,
              cancelTxt: T.G.CANCEL,
            },
          })
          .afterClosed(),
      );
      if (confirmed !== true) return;
      await this._data.archiveWorkOrder(order.id);
      await waitForCommittedRecord(
        this._data.getWorkOrder(order.id),
        (saved) => saved.archivedAt !== undefined,
        this._injector,
      );
      await this._router.navigate(['/work-orders']);
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
