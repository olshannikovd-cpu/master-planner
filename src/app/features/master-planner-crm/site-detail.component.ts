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
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { SiteFormDialogComponent } from './site-form-dialog.component';
import { WorkOrderFormDialogComponent } from './work-order-form-dialog.component';
import { WorkOrderRowsComponent } from './work-order-rows.component';
import { CRM_DIALOG_SIZE, waitForCommittedRecord } from './crm-ui.util';

@Component({
  selector: 'mp-site-detail',
  standalone: true,
  imports: [RouterLink, MatButton, TranslatePipe, WorkOrderRowsComponent],
  templateUrl: './site-detail.component.html',
  styleUrl: './crm-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteDetailComponent {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _dialog = inject(MatDialog);
  private readonly _injector = inject(Injector);
  private readonly _params = toSignal(this._route.paramMap, {
    initialValue: this._route.snapshot.paramMap,
  });
  private readonly _record = computed(() =>
    this._data.getWorkSite(this._params().get('id') ?? ''),
  );
  private readonly _owner = computed(() =>
    this._data.getCustomer(this.site()?.customerId ?? ''),
  );
  readonly site = computed(() => this._record()());
  private readonly _relatedOrders = computed(() =>
    this._data.getWorkOrdersForSite(this.site()?.id ?? ''),
  );
  readonly orders = computed(() =>
    this._relatedOrders()().filter((order) => order.archivedAt === undefined),
  );
  readonly customer = computed(() => this._owner()());
  readonly T = T;
  readonly busy = signal(false);
  readonly failed = signal(false);

  async edit(): Promise<void> {
    const site = this.site();
    if (site)
      await firstValueFrom(
        this._dialog
          .open(SiteFormDialogComponent, { ...CRM_DIALOG_SIZE, data: { site } })
          .afterClosed(),
      );
  }

  async archive(): Promise<void> {
    const site = this.site();
    if (!site || site.archivedAt !== undefined || this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    try {
      const confirmed = await firstValueFrom(
        this._dialog
          .open(DialogConfirmComponent, {
            data: {
              title: T.MASTER_PLANNER_CRM.ARCHIVE_SITE,
              message: T.MASTER_PLANNER_CRM.ARCHIVE_SITE_CONFIRM,
              okTxt: T.MASTER_PLANNER_CRM.ARCHIVE,
              cancelTxt: T.G.CANCEL,
            },
          })
          .afterClosed(),
      );
      if (confirmed !== true) return;
      await this._data.archiveWorkSite(site.id);
      await waitForCommittedRecord(
        this._data.getWorkSite(site.id),
        (saved) => saved.archivedAt !== undefined,
        this._injector,
      );
      await this._router.navigate(['/sites']);
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  async addWorkOrder(): Promise<void> {
    const site = this.site();
    const customer = this.customer();
    if (
      !site ||
      !customer ||
      site.archivedAt !== undefined ||
      customer.archivedAt !== undefined
    )
      return;
    const id = await firstValueFrom(
      this._dialog
        .open(WorkOrderFormDialogComponent, {
          ...CRM_DIALOG_SIZE,
          data: { customerId: site.customerId, workSiteId: site.id },
        })
        .afterClosed(),
    );
    if (id) await this._router.navigate(['/work-orders', id]);
  }
}
