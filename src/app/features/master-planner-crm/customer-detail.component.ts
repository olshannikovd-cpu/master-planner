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
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { T } from '../../t.const';
import { DialogConfirmComponent } from '../../ui/dialog-confirm/dialog-confirm.component';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { CustomerFormDialogComponent } from './customer-form-dialog.component';
import { SiteFormDialogComponent } from './site-form-dialog.component';
import { WorkOrderFormDialogComponent } from './work-order-form-dialog.component';
import { WorkOrderRowsComponent } from './work-order-rows.component';
import { CRM_DIALOG_SIZE, waitForCommittedRecord } from './crm-ui.util';

@Component({
  selector: 'mp-customer-detail',
  standalone: true,
  imports: [RouterLink, MatButton, MatCheckbox, TranslatePipe, WorkOrderRowsComponent],
  templateUrl: './customer-detail.component.html',
  styleUrl: './crm-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDetailComponent {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _dialog = inject(MatDialog);
  private readonly _injector = inject(Injector);
  private readonly _params = toSignal(this._route.paramMap, {
    initialValue: this._route.snapshot.paramMap,
  });
  private readonly _id = computed(() => this._params().get('id') ?? '');
  private readonly _record = computed(() => this._data.getCustomer(this._id()));
  private readonly _relatedSites = computed(() =>
    this._data.getWorkSitesForCustomer(this._id()),
  );
  readonly customer = computed(() => this._record()());
  private readonly _relatedOrders = computed(() =>
    this._data.getWorkOrdersForCustomer(this._id()),
  );
  readonly orders = computed(() =>
    this._relatedOrders()().filter((order) => order.archivedAt === undefined),
  );
  readonly T = T;
  readonly showArchivedSites = signal(false);
  readonly sites = computed(() =>
    this._relatedSites()().filter(
      (site) => (site.archivedAt !== undefined) === this.showArchivedSites(),
    ),
  );
  readonly busy = signal(false);
  readonly failed = signal(false);

  async edit(): Promise<void> {
    const customer = this.customer();
    if (customer)
      await firstValueFrom(
        this._dialog
          .open(CustomerFormDialogComponent, { ...CRM_DIALOG_SIZE, data: customer })
          .afterClosed(),
      );
  }

  async addSite(): Promise<void> {
    const customer = this.customer();
    if (!customer || customer.archivedAt !== undefined) return;
    const id = await firstValueFrom(
      this._dialog
        .open(SiteFormDialogComponent, {
          ...CRM_DIALOG_SIZE,
          data: { customerId: customer.id },
        })
        .afterClosed(),
    );
    if (id) await this._router.navigate(['/sites', id]);
  }

  async archive(): Promise<void> {
    const customer = this.customer();
    if (!customer || customer.archivedAt !== undefined || this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    try {
      const confirmed = await firstValueFrom(
        this._dialog
          .open(DialogConfirmComponent, {
            data: {
              title: T.MASTER_PLANNER_CRM.ARCHIVE_CUSTOMER,
              message: T.MASTER_PLANNER_CRM.ARCHIVE_CUSTOMER_CONFIRM,
              okTxt: T.MASTER_PLANNER_CRM.ARCHIVE,
              cancelTxt: T.G.CANCEL,
            },
          })
          .afterClosed(),
      );
      if (confirmed !== true) return;
      await this._data.archiveCustomer(customer.id);
      await waitForCommittedRecord(
        this._data.getCustomer(customer.id),
        (saved) => saved.archivedAt !== undefined,
        this._injector,
      );
      await this._router.navigate(['/customers']);
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  async addWorkOrder(): Promise<void> {
    const customer = this.customer();
    if (!customer || customer.archivedAt !== undefined) return;
    const id = await firstValueFrom(
      this._dialog
        .open(WorkOrderFormDialogComponent, {
          ...CRM_DIALOG_SIZE,
          data: { customerId: customer.id },
        })
        .afterClosed(),
    );
    if (id) await this._router.navigate(['/work-orders', id]);
  }
}
