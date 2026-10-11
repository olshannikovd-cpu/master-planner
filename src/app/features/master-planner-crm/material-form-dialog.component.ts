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
import { MaterialItem } from '../master-planner-data/master-planner-data.model';
import { T } from '../../t.const';
import { trimmedRequired, waitForCommittedRecord } from './crm-ui.util';

export interface MaterialFormData {
  workOrderId: string;
  material?: MaterialItem;
}
const quantityValidator: ValidatorFn = (control) =>
  typeof control.value === 'number' && Number.isFinite(control.value) && control.value > 0
    ? null
    : { quantity: true };
const unitPriceValidator: ValidatorFn = (control) =>
  typeof control.value === 'number' &&
  Number.isFinite(control.value) &&
  control.value >= 0
    ? null
    : { price: true };

@Component({
  selector: 'mp-material-form-dialog',
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
  templateUrl: './material-form-dialog.component.html',
  styleUrl: './crm-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialFormDialogComponent {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _injector = inject(Injector);
  private readonly _ref =
    inject<MatDialogRef<MaterialFormDialogComponent, string>>(MatDialogRef);
  readonly input = inject<MaterialFormData>(MAT_DIALOG_DATA);
  private _record = this.input.material;
  private readonly _order = this._data.getWorkOrder(this.input.workOrderId);
  private readonly _materials = this._data.getMaterialsForWorkOrder(
    this.input.workOrderId,
  );
  readonly canEdit = computed(
    () => !!this._order() && this._order()?.archivedAt === undefined,
  );
  readonly T = T;
  readonly saving = signal(false);
  readonly failed = signal(false);
  private readonly _fb = inject(FormBuilder);
  readonly form = this._fb.nonNullable.group({
    name: [this.input.material?.name ?? '', trimmedRequired],
    quantity: this._fb.control<number | null>(
      this.input.material?.quantity ?? 1,
      quantityValidator,
    ),
    unit: [this.input.material?.unit ?? ''],
    unitPrice: this._fb.control<number | null>(
      this.input.material?.unitPrice ?? null,
      unitPriceValidator,
    ),
    notes: [this.input.material?.notes ?? ''],
  });
  async submit(): Promise<void> {
    if (this.saving() || !this.canEdit()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const values = {
      name: raw.name.trim(),
      quantity: raw.quantity!,
      unit: raw.unit.trim() || undefined,
      unitPrice: raw.unitPrice!,
      notes: raw.notes.trim() || undefined,
    };
    this.saving.set(true);
    this.failed.set(false);
    this._ref.disableClose = true;
    this.form.disable();
    try {
      this._record ??= this._data.createMaterial({
        workOrderId: this.input.workOrderId,
        ...values,
      });
      const latest =
        this._materials().find((record) => record.id === this._record!.id) ??
        this._record;
      const record = { ...latest, ...values };
      await this._data.saveMaterial(record);
      await waitForCommittedRecord(
        computed(() => this._materials().find((saved) => saved.id === record.id)),
        (saved) =>
          saved.name === values.name &&
          saved.quantity === values.quantity &&
          saved.unit === values.unit &&
          saved.unitPrice === values.unitPrice &&
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
