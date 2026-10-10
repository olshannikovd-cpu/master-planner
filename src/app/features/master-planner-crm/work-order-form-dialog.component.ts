import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslatePipe } from '@ngx-translate/core';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import {
  WorkOrder,
  WorkOrderStatus,
} from '../master-planner-data/master-planner-data.model';
import { WORK_ORDER_STATUSES } from '../master-planner-data/master-planner-data.const';
import {
  isWorkOrderTimeRange,
  parseWorkOrderTime,
  formatWorkOrderTime,
} from '../master-planner-data/work-order-time.util';
import { isValidDBDateStr } from '../../util/get-db-date-str';
import { T } from '../../t.const';
import { trimmedRequired, waitForCommittedRecord } from './crm-ui.util';
import { withWorkOrderStatus, WORK_ORDER_STATUS_LABELS } from './work-order-ui.util';

export interface WorkOrderFormData {
  order?: WorkOrder;
  customerId?: string;
  workSiteId?: string;
}
const optionalTime =
  (isEnd: boolean): ValidatorFn =>
  (control) =>
    !control.value ||
    (typeof control.value === 'string' &&
      parseWorkOrderTime(control.value, isEnd) !== null)
      ? null
      : { time: true };
const optionalDay: ValidatorFn = (control) =>
  !control.value || (typeof control.value === 'string' && isValidDBDateStr(control.value))
    ? null
    : { date: true };
const priceValidator: ValidatorFn = (control) =>
  control.value === null ||
  (typeof control.value === 'number' &&
    Number.isFinite(control.value) &&
    control.value >= 0)
    ? null
    : { price: true };
const timeRangeValidator: ValidatorFn = (control) => {
  const start = control.get('startTime')?.value as string;
  const end = control.get('endTime')?.value as string;
  if (!start || !end) return null;
  const startMinutes = parseWorkOrderTime(start);
  const endMinutes = parseWorkOrderTime(end, true);
  return startMinutes === null ||
    endMinutes === null ||
    isWorkOrderTimeRange(startMinutes, endMinutes)
    ? null
    : { timeRange: true };
};

@Component({
  selector: 'mp-work-order-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatFormField,
    MatLabel,
    MatHint,
    MatError,
    MatInput,
    MatSelect,
    MatOption,
    TranslatePipe,
  ],
  templateUrl: './work-order-form-dialog.component.html',
  styleUrl: './crm-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkOrderFormDialogComponent implements OnInit {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _injector = inject(Injector);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _dialogRef =
    inject<MatDialogRef<WorkOrderFormDialogComponent, string>>(MatDialogRef);
  readonly input = inject<WorkOrderFormData>(MAT_DIALOG_DATA);
  private _record = this.input.order;
  private readonly _customers = this._data.getCustomers();
  private readonly _sites = this._data.getWorkSites();
  readonly T = T;
  readonly statuses = WORK_ORDER_STATUSES;
  readonly statusLabels = WORK_ORDER_STATUS_LABELS;
  readonly saving = signal(false);
  readonly failed = signal(false);
  readonly customers = computed(() =>
    this._customers().filter((customer) => customer.archivedAt === undefined),
  );
  readonly archivedOwner = computed(() =>
    this._customers().find(
      (customer) =>
        customer.id === this.input.order?.customerId && customer.archivedAt !== undefined,
    ),
  );
  private readonly _fb = inject(FormBuilder);
  readonly form = this._fb.nonNullable.group(
    {
      customerId: [
        this.input.order?.customerId ?? this.input.customerId ?? '',
        trimmedRequired,
      ],
      workSiteId: [this.input.order?.workSiteId ?? this.input.workSiteId ?? ''],
      title: [this.input.order?.title ?? '', trimmedRequired],
      description: [this.input.order?.description ?? ''],
      status: [this.input.order?.status ?? ('planned' as WorkOrderStatus)],
      scheduledDay: [this.input.order?.scheduledDay ?? '', optionalDay],
      startTime: [
        formatWorkOrderTime(this.input.order?.scheduledStart),
        optionalTime(false),
      ],
      endTime: [formatWorkOrderTime(this.input.order?.scheduledEnd), optionalTime(true)],
      workPrice: this._fb.control<number | null>(
        this.input.order?.workPrice ?? null,
        priceValidator,
      ),
      notes: [this.input.order?.notes ?? ''],
    },
    { validators: timeRangeValidator },
  );
  private readonly _customerId = toSignal(this.form.controls.customerId.valueChanges, {
    initialValue: this.form.controls.customerId.value,
  });
  readonly sites = computed(() =>
    this._sites().filter(
      (site) => site.customerId === this._customerId() && site.archivedAt === undefined,
    ),
  );
  readonly archivedSite = computed(() =>
    this._sites().find(
      (site) =>
        site.id === this.input.order?.workSiteId &&
        site.customerId === this._customerId() &&
        site.archivedAt !== undefined,
    ),
  );

  ngOnInit(): void {
    this.form.controls.customerId.valueChanges
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((id) => {
        const selected = this._sites().find(
          (site) => site.id === this.form.controls.workSiteId.value,
        );
        if (selected && selected.customerId !== id)
          this.form.controls.workSiteId.setValue('');
      });
  }

  async submit(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    const raw = this.form.getRawValue();
    const customer = this._customers().find((record) => record.id === raw.customerId);
    const site = this._sites().find((record) => record.id === raw.workSiteId);
    if (
      !customer ||
      (customer.archivedAt !== undefined && this.input.order?.customerId !== customer.id)
    )
      this.form.controls.customerId.setErrors({ required: true });
    if (
      raw.workSiteId &&
      (!site ||
        site.customerId !== raw.customerId ||
        (site.archivedAt !== undefined && this.input.order?.workSiteId !== site.id))
    )
      this.form.controls.workSiteId.setErrors({ site: true });
    if (!WORK_ORDER_STATUSES.includes(raw.status))
      this.form.controls.status.setErrors({ status: true });
    if (this.form.invalid) return;
    const values = {
      customerId: raw.customerId,
      workSiteId: raw.workSiteId || undefined,
      title: raw.title.trim(),
      description: raw.description.trim(),
      status: raw.status,
      scheduledDay: raw.scheduledDay || undefined,
      scheduledStart: raw.startTime ? parseWorkOrderTime(raw.startTime)! : undefined,
      scheduledEnd: raw.endTime ? parseWorkOrderTime(raw.endTime, true)! : undefined,
      workPrice: raw.workPrice ?? undefined,
      notes: raw.notes.trim(),
    };
    this.saving.set(true);
    this.failed.set(false);
    this._dialogRef.disableClose = true;
    this.form.disable();
    try {
      this._record ??= this._data.createWorkOrder(values);
      const latest = this._data.getWorkOrder(this._record.id)() ?? this._record;
      const record = withWorkOrderStatus(
        { ...latest, ...values, status: latest.status },
        raw.status,
      );
      await this._data.saveWorkOrder(record);
      await waitForCommittedRecord(
        this._data.getWorkOrder(record.id),
        (saved) =>
          Object.entries(values).every(
            ([key, value]) => saved[key as keyof typeof values] === value,
          ) && saved.completedAt === record.completedAt,
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
