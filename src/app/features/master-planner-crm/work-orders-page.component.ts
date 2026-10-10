import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { T } from '../../t.const';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { WORK_ORDER_STATUSES } from '../master-planner-data/master-planner-data.const';
import { WorkOrderStatus } from '../master-planner-data/master-planner-data.model';
import { WorkOrderFormDialogComponent } from './work-order-form-dialog.component';
import { WorkOrderRowsComponent } from './work-order-rows.component';
import { WORK_ORDER_STATUS_LABELS } from './work-order-ui.util';
import { CRM_DIALOG_SIZE, matchesCrmSearch } from './crm-ui.util';

@Component({
  selector: 'mp-work-orders-page',
  standalone: true,
  imports: [
    FormsModule,
    MatButton,
    MatCheckbox,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelect,
    MatOption,
    TranslatePipe,
    WorkOrderRowsComponent,
  ],
  templateUrl: './work-orders-page.component.html',
  styleUrl: './crm-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkOrdersPageComponent {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _dialog = inject(MatDialog);
  private readonly _router = inject(Router);
  private readonly _orders = this._data.getWorkOrders();
  private readonly _customers = this._data.getCustomers();
  private readonly _sites = this._data.getWorkSites();
  readonly T = T;
  readonly statuses = WORK_ORDER_STATUSES;
  readonly statusLabels = WORK_ORDER_STATUS_LABELS;
  readonly search = signal('');
  readonly status = signal<WorkOrderStatus | ''>('');
  readonly showArchived = signal(false);
  readonly orders = computed(() => {
    const customers = new Map(
      this._customers().map((record) => [record.id, record.name]),
    );
    const sites = new Map(this._sites().map((record) => [record.id, record.name]));
    return this._orders().filter(
      (order) =>
        (order.archivedAt !== undefined) === this.showArchived() &&
        (!this.status() || order.status === this.status()) &&
        matchesCrmSearch(
          [
            order.title,
            order.description,
            customers.get(order.customerId),
            order.workSiteId ? sites.get(order.workSiteId) : undefined,
          ],
          this.search(),
        ),
    );
  });

  async addWorkOrder(): Promise<void> {
    const id = await firstValueFrom(
      this._dialog
        .open(WorkOrderFormDialogComponent, { ...CRM_DIALOG_SIZE, data: {} })
        .afterClosed(),
    );
    if (id) await this._router.navigate(['/work-orders', id]);
  }
}
