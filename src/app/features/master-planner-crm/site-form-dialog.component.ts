import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslatePipe } from '@ngx-translate/core';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { WorkSite } from '../master-planner-data/master-planner-data.model';
import { T } from '../../t.const';
import { trimmedRequired, waitForCommittedRecord } from './crm-ui.util';

export interface SiteFormDialogData {
  site?: WorkSite;
  customerId?: string;
}

@Component({
  selector: 'mp-site-form-dialog',
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
    MatSelect,
    MatOption,
    TranslatePipe,
  ],
  templateUrl: './site-form-dialog.component.html',
  styleUrl: './crm-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFormDialogComponent {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _injector = inject(Injector);
  private readonly _dialogRef =
    inject<MatDialogRef<SiteFormDialogComponent, string>>(MatDialogRef);
  readonly input = inject<SiteFormDialogData>(MAT_DIALOG_DATA);
  private _record = this.input.site;
  readonly T = T;
  readonly saving = signal(false);
  readonly failed = signal(false);
  private readonly _customers = this._data.getCustomers();
  readonly customers = computed(() =>
    this._customers().filter((customer) => customer.archivedAt === undefined),
  );
  // Preserve an existing archived owner as a disabled option; it is not selectable for a new site.
  readonly archivedOwner = computed(() =>
    this._customers().find(
      (customer) =>
        customer.id === this.input.site?.customerId && customer.archivedAt !== undefined,
    ),
  );
  readonly form = inject(FormBuilder).nonNullable.group({
    customerId: [
      this.input.site?.customerId ?? this.input.customerId ?? '',
      trimmedRequired,
    ],
    name: [this.input.site?.name ?? '', trimmedRequired],
    address: [this.input.site?.address ?? '', trimmedRequired],
    notes: [this.input.site?.notes ?? ''],
  });

  async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    const raw = this.form.getRawValue();
    const customer = this._customers().find((record) => record.id === raw.customerId);
    if (
      !customer ||
      (customer.archivedAt !== undefined && this.input.site?.customerId !== customer.id)
    ) {
      this.form.controls.customerId.setErrors({ required: true });
    }
    if (this.form.invalid) return;
    const values = {
      customerId: raw.customerId,
      name: raw.name.trim(),
      address: raw.address.trim(),
      notes: raw.notes.trim(),
    };
    this.saving.set(true);
    this.failed.set(false);
    this._dialogRef.disableClose = true;
    this.form.disable();
    try {
      this._record ??= this._data.createWorkSite(values);
      const latest = this._data.getWorkSite(this._record.id)() ?? this._record;
      const record = { ...latest, ...values };
      await this._data.saveWorkSite(record);
      await waitForCommittedRecord(
        this._data.getWorkSite(record.id),
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
