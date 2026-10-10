import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { WorkOrder } from '../master-planner-data/master-planner-data.model';
import { DateTimeFormatService } from '../../core/date-time-format/date-time-format.service';
import { LocaleDatePipe } from '../../ui/pipes/locale-date.pipe';
import { T } from '../../t.const';
import { workOrderTimeLabel, WORK_ORDER_STATUS_LABELS } from './work-order-ui.util';

@Component({
  selector: 'mp-work-order-rows',
  standalone: true,
  imports: [RouterLink, TranslatePipe, LocaleDatePipe],
  templateUrl: './work-order-rows.component.html',
  styleUrl: './crm-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkOrderRowsComponent {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _format = inject(DateTimeFormatService);
  private readonly _customers = this._data.getCustomers();
  private readonly _sites = this._data.getWorkSites();
  readonly orders = input.required<readonly WorkOrder[]>();
  readonly showDate = input(true);
  readonly showPrice = input(true);
  readonly T = T;
  readonly statusLabels = WORK_ORDER_STATUS_LABELS;
  readonly rows = computed(() => {
    const customers = new Map(this._customers().map((record) => [record.id, record]));
    const sites = new Map(this._sites().map((record) => [record.id, record]));
    const format = new Intl.NumberFormat(this._format.currentLocale());
    return this.orders().map((order) => ({
      order,
      customerName: customers.get(order.customerId)?.name,
      siteName: order.workSiteId ? sites.get(order.workSiteId)?.name : undefined,
      time: workOrderTimeLabel(order),
      price: order.workPrice === undefined ? undefined : format.format(order.workPrice),
    }));
  });
}
