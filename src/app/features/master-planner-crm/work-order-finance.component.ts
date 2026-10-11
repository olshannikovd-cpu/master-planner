import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import {
  MaterialItem,
  Payment,
  WorkOrder,
} from '../master-planner-data/master-planner-data.model';
import {
  calculateMaterialTotal,
  calculateMaterialsTotal,
  calculatePaid,
  calculateRemaining,
} from '../master-planner-data/master-planner-finance.util';
import { DateTimeFormatService } from '../../core/date-time-format/date-time-format.service';
import { parseDbDateStr } from '../../util/parse-db-date-str';
import { DialogConfirmComponent } from '../../ui/dialog-confirm/dialog-confirm.component';
import { T } from '../../t.const';
import { CRM_DIALOG_SIZE, waitForCommittedValue } from './crm-ui.util';
import { PaymentFormDialogComponent } from './payment-form-dialog.component';
import { MaterialFormDialogComponent } from './material-form-dialog.component';

@Component({
  selector: 'mp-work-order-finance',
  standalone: true,
  imports: [MatButton, TranslatePipe],
  templateUrl: './work-order-finance.component.html',
  styleUrl: './crm-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkOrderFinanceComponent {
  readonly order = input.required<WorkOrder>();
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _dialog = inject(MatDialog);
  private readonly _injector = inject(Injector);
  private readonly _format = inject(DateTimeFormatService);
  private readonly _paymentQuery = computed(() =>
    this._data.getPaymentsForWorkOrder(this.order().id),
  );
  private readonly _materialQuery = computed(() =>
    this._data.getMaterialsForWorkOrder(this.order().id),
  );
  readonly payments = computed(() =>
    [...this._paymentQuery()()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    ),
  );
  readonly materials = computed(() => this._materialQuery()());
  readonly readOnly = computed(() => this.order().archivedAt !== undefined);
  readonly busy = signal(false);
  readonly failed = signal(false);
  readonly T = T;
  readonly paymentRows = computed(() =>
    this.payments().map((record) => ({
      record,
      amount: this._number(record.amount),
      date: this._format.formatDate(parseDbDateStr(record.date)),
    })),
  );
  readonly materialRows = computed(() =>
    this.materials().map((record) => ({
      record,
      quantity: this._number(record.quantity),
      unitPrice: this._number(record.unitPrice),
      total: this._number(calculateMaterialTotal(record)),
    })),
  );
  readonly summary = computed(() => {
    const remaining = calculateRemaining(this.order().workPrice, this.payments());
    return {
      workPrice:
        this.order().workPrice === undefined
          ? undefined
          : this._number(this.order().workPrice!),
      paid: this._number(calculatePaid(this.payments())),
      materials: this._number(calculateMaterialsTotal(this.materials())),
      remaining:
        remaining === undefined ? undefined : this._number(Math.max(0, remaining)),
      overpaid:
        remaining !== undefined && remaining < 0 ? this._number(-remaining) : undefined,
    };
  });

  async editPayment(payment?: Payment): Promise<void> {
    if (this.readOnly() || this.busy()) return;
    await firstValueFrom(
      this._dialog
        .open(PaymentFormDialogComponent, {
          ...CRM_DIALOG_SIZE,
          data: { workOrderId: this.order().id, payment },
        })
        .afterClosed(),
    );
  }
  async editMaterial(material?: MaterialItem): Promise<void> {
    if (this.readOnly() || this.busy()) return;
    await firstValueFrom(
      this._dialog
        .open(MaterialFormDialogComponent, {
          ...CRM_DIALOG_SIZE,
          data: { workOrderId: this.order().id, material },
        })
        .afterClosed(),
    );
  }
  async deletePayment(payment: Payment): Promise<void> {
    if (!this.payments().some((record) => record.id === payment.id)) return;
    await this._delete('payment', payment.id);
  }
  async deleteMaterial(material: MaterialItem): Promise<void> {
    if (!this.materials().some((record) => record.id === material.id)) return;
    await this._delete('material', material.id);
  }
  private _number(value: number): string {
    return new Intl.NumberFormat(this._format.currentLocale()).format(value);
  }
  private async _delete(type: 'payment' | 'material', id: string): Promise<void> {
    if (this.readOnly() || this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    try {
      const confirmed = await firstValueFrom(
        this._dialog
          .open(DialogConfirmComponent, {
            data: {
              title:
                type === 'payment'
                  ? T.MASTER_PLANNER_CRM.DELETE_PAYMENT
                  : T.MASTER_PLANNER_CRM.DELETE_MATERIAL,
              message:
                type === 'payment'
                  ? T.MASTER_PLANNER_CRM.DELETE_PAYMENT_CONFIRM
                  : T.MASTER_PLANNER_CRM.DELETE_MATERIAL_CONFIRM,
              okTxt: T.G.DELETE,
              cancelTxt: T.G.CANCEL,
            },
          })
          .afterClosed(),
      );
      if (confirmed !== true || this.readOnly()) return;
      if (type === 'payment') {
        await this._data.deletePayment(id);
        await waitForCommittedValue(
          this.payments,
          (records) => !records.some((record) => record.id === id),
          this._injector,
        );
      } else {
        await this._data.deleteMaterial(id);
        await waitForCommittedValue(
          this.materials,
          (records) => !records.some((record) => record.id === id),
          this._injector,
        );
      }
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
