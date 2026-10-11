import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidatorFn } from '@angular/forms';
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
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { Payment } from '../master-planner-data/master-planner-data.model';
import { getDbDateStr, isValidDBDateStr } from '../../util/get-db-date-str';
import { T } from '../../t.const';
import { waitForCommittedRecord } from './crm-ui.util';

export interface PaymentFormData {
  workOrderId: string;
  payment?: Payment;
}

@Component({
  selector: 'mp-payment-form-dialog',
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
  templateUrl: './payment-form-dialog.component.html',
  styleUrl: './crm-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentFormDialogComponent {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _injector = inject(Injector);
  private readonly _ref =
    inject<MatDialogRef<PaymentFormDialogComponent, string>>(MatDialogRef);
  readonly input = inject<PaymentFormData>(MAT_DIALOG_DATA);
  private _record = this.input.payment;
  private readonly _order = this._data.getWorkOrder(this.input.workOrderId);
  private readonly _payments = this._data.getPaymentsForWorkOrder(this.input.workOrderId);
  readonly canEdit = computed(
    () => !!this._order() && this._order()?.archivedAt === undefined,
  );
  readonly T = T;
  readonly saving = signal(false);
  readonly failed = signal(false);
  private readonly _amountValidator: ValidatorFn = (control) =>
    typeof control.value === 'number' &&
    Number.isFinite(control.value) &&
    (control.value > 0 || ((this.input.payment?.amount ?? 0) < 0 && control.value < 0))
      ? null
      : { amount: true };
  private readonly _dateValidator: ValidatorFn = (control) =>
    typeof control.value === 'string' && isValidDBDateStr(control.value)
      ? null
      : { date: true };
  private readonly _fb = inject(FormBuilder);
  readonly form = this._fb.nonNullable.group({
    amount: this._fb.control<number | null>(
      this.input.payment?.amount ?? null,
      this._amountValidator,
    ),
    date: [this.input.payment?.date ?? getDbDateStr(), this._dateValidator],
    method: [this.input.payment?.method ?? ''],
    notes: [this.input.payment?.notes ?? ''],
  });

  async submit(): Promise<void> {
    if (this.saving() || !this.canEdit()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const values = {
      amount: raw.amount!,
      date: raw.date,
      method: raw.method.trim() || undefined,
      notes: raw.notes.trim() || undefined,
    };
    this.saving.set(true);
    this.failed.set(false);
    this._ref.disableClose = true;
    this.form.disable();
    try {
      this._record ??= this._data.createPayment({
        workOrderId: this.input.workOrderId,
        ...values,
      });
      const latest =
        this._payments().find((record) => record.id === this._record!.id) ?? this._record;
      const record = { ...latest, ...values };
      await this._data.savePayment(record);
      await waitForCommittedRecord(
        computed(() => this._payments().find((saved) => saved.id === record.id)),
        (saved) =>
          saved.amount === values.amount &&
          saved.date === values.date &&
          saved.method === values.method &&
          saved.notes === values.notes,
        this._injector,
      );
      this._ref.close(record.id);
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
