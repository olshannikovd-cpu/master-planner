import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injector,
  signal,
} from '@angular/core';
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
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { Customer } from '../master-planner-data/master-planner-data.model';
import { T } from '../../t.const';
import { trimmedRequired, waitForCommittedRecord } from './crm-ui.util';

@Component({
  selector: 'mp-customer-form-dialog',
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
  templateUrl: './customer-form-dialog.component.html',
  styleUrl: './crm-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFormDialogComponent {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _injector = inject(Injector);
  private readonly _dialogRef =
    inject<MatDialogRef<CustomerFormDialogComponent, string>>(MatDialogRef);
  readonly customer = inject<Customer | null>(MAT_DIALOG_DATA);
  private _record = this.customer;
  readonly T = T;
  readonly saving = signal(false);
  readonly failed = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    name: [this.customer?.name ?? '', trimmedRequired],
    phone: [this.customer?.phone ?? '', trimmedRequired],
    phone2: [this.customer?.phone2 ?? ''],
    email: [this.customer?.email ?? ''],
    notes: [this.customer?.notes ?? ''],
  });

  async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const values = {
      name: raw.name.trim(),
      phone: raw.phone.trim(),
      phone2: raw.phone2.trim(),
      email: raw.email.trim(),
      notes: raw.notes.trim(),
    };
    this.saving.set(true);
    this.failed.set(false);
    this._dialogRef.disableClose = true;
    this.form.disable();
    try {
      this._record ??= this._data.createCustomer(values);
      const latest = this._data.getCustomer(this._record.id)() ?? this._record;
      const record = { ...latest, ...values };
      await this._data.saveCustomer(record);
      await waitForCommittedRecord(
        this._data.getCustomer(record.id),
        (saved) =>
          Object.entries(values).every(
            ([key, value]) => saved[key as keyof typeof values] === value,
          ),
        this._injector,
      );
      this._dialogRef.close(record.id);
    } catch {
      this.failed.set(true);
    } finally {
      this.saving.set(false);
      this._dialogRef.disableClose = false;
      this.form.enable();
    }
  }

  cancel(): void {
    if (!this.saving()) this._dialogRef.close();
  }
}
