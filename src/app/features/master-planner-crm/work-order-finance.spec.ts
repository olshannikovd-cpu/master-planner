import { computed, Signal, signal, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { DateTimeFormatService } from '../../core/date-time-format/date-time-format.service';
import { getDbDateStr } from '../../util/get-db-date-str';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import {
  MasterPlannerDraft,
  MaterialItem,
  Payment,
  WorkOrder,
} from '../master-planner-data/master-planner-data.model';
import {
  materialFixture,
  orderFixture,
  paymentFixture,
} from '../master-planner-data/master-planner-data.test-helper';
import {
  PaymentFormData,
  PaymentFormDialogComponent,
} from './payment-form-dialog.component';
import {
  MaterialFormData,
  MaterialFormDialogComponent,
} from './material-form-dialog.component';
import { WorkOrderFinanceComponent } from './work-order-finance.component';

interface FinanceTestData {
  getWorkOrder: () => Signal<WorkOrder | undefined>;
  getPaymentsForWorkOrder: (id: string) => Signal<Payment[]>;
  getMaterialsForWorkOrder: (id: string) => Signal<MaterialItem[]>;
  createPayment: jasmine.Spy;
  createMaterial: jasmine.Spy;
  savePayment: jasmine.Spy;
  saveMaterial: jasmine.Spy;
  deletePayment: jasmine.Spy;
  deleteMaterial: jasmine.Spy;
}

describe('Work order payments, materials and financial summary', () => {
  let order = signal<WorkOrder | undefined>(undefined);
  let payments = signal<Payment[]>([]);
  let materials = signal<MaterialItem[]>([]);
  let locale = signal('en-GB');
  const makeData = (): FinanceTestData => ({
    getWorkOrder: () => order,
    getPaymentsForWorkOrder: (id: string) =>
      computed(() => payments().filter((record) => record.workOrderId === id)),
    getMaterialsForWorkOrder: (id: string) =>
      computed(() => materials().filter((record) => record.workOrderId === id)),
    createPayment: jasmine
      .createSpy('createPayment')
      .and.callFake((draft: MasterPlannerDraft<Payment>) => ({
        ...paymentFixture('new-payment'),
        ...draft,
      })),
    createMaterial: jasmine
      .createSpy('createMaterial')
      .and.callFake((draft: MasterPlannerDraft<MaterialItem>) => ({
        ...materialFixture('new-material'),
        ...draft,
      })),
    savePayment: jasmine
      .createSpy('savePayment')
      .and.callFake(async (record: Payment) => {
        payments.update((all) => [
          ...all.filter((entry) => entry.id !== record.id),
          record,
        ]);
      }),
    saveMaterial: jasmine
      .createSpy('saveMaterial')
      .and.callFake(async (record: MaterialItem) => {
        materials.update((all) => [
          ...all.filter((entry) => entry.id !== record.id),
          record,
        ]);
      }),
    deletePayment: jasmine.createSpy('deletePayment').and.callFake(async (id: string) => {
      payments.update((all) => all.filter((record) => record.id !== id));
    }),
    deleteMaterial: jasmine
      .createSpy('deleteMaterial')
      .and.callFake(async (id: string) => {
        materials.update((all) => all.filter((record) => record.id !== id));
      }),
  });
  let data: ReturnType<typeof makeData>;
  let dialog: { open: jasmine.Spy };
  let ref: { close: jasmine.Spy; disableClose: boolean };
  beforeEach(() => {
    order = signal({ ...orderFixture(), workPrice: 100000 });
    payments = signal([{ ...paymentFixture(), amount: 30000, date: '2026-10-11' }]);
    materials = signal([
      { ...materialFixture(), name: 'Cable', quantity: 10, unit: 'm', unitPrice: 100 },
    ]);
    locale = signal('en-GB');
    data = makeData();
    dialog = {
      open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(true) }),
    };
    ref = { close: jasmine.createSpy('close'), disableClose: false };
  });
  const create = <T>(
    component: Type<T>,
    input: PaymentFormData | MaterialFormData = { workOrderId: 'o1' },
  ): ComponentFixture<T> => {
    TestBed.configureTestingModule({
      imports: [component, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: MasterPlannerDataService, useValue: data },
        { provide: MatDialog, useValue: dialog },
        { provide: MAT_DIALOG_DATA, useValue: input },
        { provide: MatDialogRef, useValue: ref },
        {
          provide: DateTimeFormatService,
          useValue: {
            currentLocale: locale,
            formatDate: DateTimeFormatService.prototype.formatDate,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(component);
    if (component === WorkOrderFinanceComponent)
      fixture.componentRef.setInput('order', order());
    fixture.detectChanges();
    return fixture;
  };

  it('creates a payment via the factory, trims optional fields and defaults to the calendar day', async () => {
    const form = create(PaymentFormDialogComponent).componentInstance;
    expect(form.form.controls.date.value).toBe(getDbDateStr());
    form.form.patchValue({
      amount: 20000,
      method: ' Bank transfer ',
      notes: ' Advance ',
    });
    await form.submit();
    expect(data.createPayment).toHaveBeenCalledWith({
      workOrderId: 'o1',
      amount: 20000,
      date: getDbDateStr(),
      method: 'Bank transfer',
      notes: 'Advance',
    });
    expect(payments().length).toBe(2);
    expect(ref.close).toHaveBeenCalledWith('new-payment');
  });
  it('edits a payment without changing ID, createdAt or workOrderId', async () => {
    const existing = payments()[0];
    const form = create(PaymentFormDialogComponent, {
      workOrderId: 'o1',
      payment: existing,
    }).componentInstance;
    form.form.patchValue({ amount: 35000, method: '', notes: '' });
    await form.submit();
    expect(data.createPayment).not.toHaveBeenCalled();
    expect(data.savePayment).toHaveBeenCalledWith({
      ...existing,
      amount: 35000,
      method: undefined,
      notes: undefined,
    });
    expect(payments().length).toBe(1);
  });
  it('rejects empty, zero, negative, infinite and NaN amounts for a new payment', async () => {
    const form = create(PaymentFormDialogComponent).componentInstance;
    for (const value of [null, 0, -1, Infinity, -Infinity, NaN]) {
      form.form.controls.amount.setValue(value);
      await form.submit();
      expect(form.form.controls.amount.invalid).withContext(String(value)).toBeTrue();
    }
    expect(data.savePayment).not.toHaveBeenCalled();
  });
  it('rejects missing and invalid payment dates', async () => {
    const form = create(PaymentFormDialogComponent).componentInstance;
    form.form.controls.amount.setValue(1);
    for (const value of ['', '2026-02-30', '11/10/2026']) {
      form.form.controls.date.setValue(value);
      await form.submit();
      expect(form.form.controls.date.invalid).toBeTrue();
    }
    expect(data.savePayment).not.toHaveBeenCalled();
  });
  it('keeps existing negative refund payments editable and includes them in paid', async () => {
    const refund = { ...paymentFixture(), amount: -2000 };
    payments.set([refund]);
    const form = create(PaymentFormDialogComponent, {
      workOrderId: 'o1',
      payment: refund,
    }).componentInstance;
    form.form.controls.notes.setValue('Refund note');
    await form.submit();
    expect(data.savePayment.calls.mostRecent().args[0].amount).toBe(-2000);
  });
  it('keeps a failed payment form open and retries with the same factory ID', async () => {
    data.savePayment.and.rejectWith(new Error('Synthetic failure'));
    const form = create(PaymentFormDialogComponent).componentInstance;
    form.form.controls.amount.setValue(10);
    await form.submit();
    expect(form.failed()).toBeTrue();
    expect(ref.close).not.toHaveBeenCalled();
    expect(ref.disableClose).toBeFalse();
    expect(form.form.enabled).toBeTrue();
    data.savePayment.and.callFake(async (record: Payment) => {
      payments.update((all) => [...all, record]);
    });
    await form.submit();
    expect(data.createPayment).toHaveBeenCalledTimes(1);
    expect(ref.close).toHaveBeenCalledWith('new-payment');
  });
  it('waits for committed payment state instead of closing on a queued save promise', async () => {
    data.savePayment.and.resolveTo();
    const fixture = create(PaymentFormDialogComponent);
    const form = fixture.componentInstance;
    form.form.controls.amount.setValue(10);
    const saving = form.submit();
    await Promise.resolve();
    fixture.detectChanges();
    expect(form.saving()).toBeTrue();
    expect(ref.disableClose).toBeTrue();
    expect(ref.close).not.toHaveBeenCalled();
    payments.update((all) => [...all, data.savePayment.calls.mostRecent().args[0]]);
    fixture.detectChanges();
    await saving;
    expect(ref.close).toHaveBeenCalledWith('new-payment');
  });
  it('sorts payments by date and only shows records of this work order', () => {
    payments.set([
      { ...paymentFixture('late'), date: '2026-10-12' },
      { ...paymentFixture('early'), date: '2026-10-10' },
      paymentFixture('unrelated', 'other'),
    ]);
    const page = create(WorkOrderFinanceComponent).componentInstance;
    expect(page.payments().map((record) => record.id)).toEqual(['early', 'late']);
  });
  it('deletes only the selected payment and reacts in the summary', async () => {
    payments.update((all) => [...all, { ...paymentFixture('p2'), amount: 20000 }]);
    const page = create(WorkOrderFinanceComponent).componentInstance;
    await page.deletePayment(payments()[0]);
    expect(data.deletePayment).toHaveBeenCalledOnceWith('p1');
    expect(payments().map((record) => record.id)).toEqual(['p2']);
    expect(page.summary().paid).toBe('20,000');
    expect(page.summary().remaining).toBe('80,000');
    expect(materials().length).toBe(1);
  });
  it('does not delete either kind of record when confirmation is cancelled', async () => {
    dialog.open.and.returnValue({ afterClosed: () => of(false) });
    const page = create(WorkOrderFinanceComponent).componentInstance;
    await page.deletePayment(payments()[0]);
    await page.deleteMaterial(materials()[0]);
    expect(data.deletePayment).not.toHaveBeenCalled();
    expect(data.deleteMaterial).not.toHaveBeenCalled();
  });
  it('waits for committed deletion before unlocking actions', async () => {
    data.deletePayment.and.resolveTo();
    const fixture = create(WorkOrderFinanceComponent);
    const page = fixture.componentInstance;
    const deleting = page.deletePayment(payments()[0]);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(page.busy()).toBeTrue();
    expect(page.payments().length).toBe(1);
    payments.set([]);
    fixture.detectChanges();
    await deleting;
    expect(page.busy()).toBeFalse();
    expect(page.summary().paid).toBe('0');
  });
  it('reports failed deletion without removing the record', async () => {
    data.deleteMaterial.and.rejectWith(new Error('Synthetic failure'));
    const page = create(WorkOrderFinanceComponent).componentInstance;
    await page.deleteMaterial(materials()[0]);
    expect(page.failed()).toBeTrue();
    expect(page.busy()).toBeFalse();
    expect(materials().length).toBe(1);
  });
  it('creates a material using the factory with trimmed strings and line total', async () => {
    const form = create(MaterialFormDialogComponent).componentInstance;
    form.form.patchValue({
      name: ' Cable ',
      quantity: 10,
      unit: ' m ',
      unitPrice: 100,
      notes: ' Note ',
    });
    await form.submit();
    expect(data.createMaterial).toHaveBeenCalledWith({
      workOrderId: 'o1',
      name: 'Cable',
      quantity: 10,
      unit: 'm',
      unitPrice: 100,
      notes: 'Note',
    });
    expect(ref.close).toHaveBeenCalledWith('new-material');
  });
  it('edits a material without changing ID, createdAt or workOrderId', async () => {
    const existing = materials()[0];
    const form = create(MaterialFormDialogComponent, {
      workOrderId: 'o1',
      material: existing,
    }).componentInstance;
    form.form.patchValue({ quantity: 12, unitPrice: 125, unit: '', notes: '' });
    await form.submit();
    expect(data.createMaterial).not.toHaveBeenCalled();
    expect(data.saveMaterial).toHaveBeenCalledWith({
      ...existing,
      quantity: 12,
      unitPrice: 125,
      unit: undefined,
      notes: undefined,
    });
  });
  it('rejects blank material names', async () => {
    const form = create(MaterialFormDialogComponent).componentInstance;
    form.form.patchValue({ name: '  ', quantity: 1, unitPrice: 0 });
    await form.submit();
    expect(form.form.controls.name.invalid).toBeTrue();
    expect(data.saveMaterial).not.toHaveBeenCalled();
  });
  it('requires a finite quantity greater than zero', async () => {
    const form = create(MaterialFormDialogComponent).componentInstance;
    form.form.patchValue({ name: 'Cable', unitPrice: 1 });
    for (const value of [null, 0, -1, Infinity, NaN]) {
      form.form.controls.quantity.setValue(value);
      await form.submit();
      expect(form.form.controls.quantity.invalid).withContext(String(value)).toBeTrue();
    }
    expect(data.saveMaterial).not.toHaveBeenCalled();
  });
  it('requires a finite nonnegative unit price and accepts zero', async () => {
    const form = create(MaterialFormDialogComponent).componentInstance;
    form.form.patchValue({ name: 'Free item', quantity: 1 });
    for (const value of [null, -1, Infinity, NaN]) {
      form.form.controls.unitPrice.setValue(value);
      await form.submit();
      expect(form.form.controls.unitPrice.invalid).withContext(String(value)).toBeTrue();
    }
    expect(data.saveMaterial).not.toHaveBeenCalled();
    form.form.controls.unitPrice.setValue(0);
    await form.submit();
    expect(data.saveMaterial).toHaveBeenCalled();
  });
  it('deletes only one material and updates materials total without changing the balance', async () => {
    materials.update((all) => [
      ...all,
      { ...materialFixture('m2'), quantity: 2, unitPrice: 250 },
    ]);
    const page = create(WorkOrderFinanceComponent).componentInstance;
    expect(page.summary().materials).toBe('1,500');
    await page.deleteMaterial(materials()[0]);
    expect(data.deleteMaterial).toHaveBeenCalledOnceWith('m1');
    expect(materials().map((record) => record.id)).toEqual(['m2']);
    expect(page.summary().materials).toBe('500');
    expect(page.summary().remaining).toBe('70,000');
  });
  it('uses work price minus payments and keeps materials separate', () => {
    const page = create(WorkOrderFinanceComponent).componentInstance;
    expect(page.summary()).toEqual({
      workPrice: '100,000',
      paid: '30,000',
      remaining: '70,000',
      materials: '1,000',
      overpaid: undefined,
    });
    expect(page.materialRows()[0].total).toBe('1,000');
  });
  it('reactively recalculates multiple payments, refunds, material edits and deletion', () => {
    const page = create(WorkOrderFinanceComponent).componentInstance;
    payments.update((all) => [
      ...all,
      { ...paymentFixture('p2'), amount: 20000 },
      { ...paymentFixture('refund'), amount: -5000 },
    ]);
    expect(page.summary().paid).toBe('45,000');
    expect(page.summary().remaining).toBe('55,000');
    materials.set([{ ...materials()[0], quantity: 12 }]);
    expect(page.summary().materials).toBe('1,200');
    payments.set([]);
    materials.set([]);
    expect(page.summary().paid).toBe('0');
    expect(page.summary().remaining).toBe('100,000');
    expect(page.summary().materials).toBe('0');
  });
  it('shows an overpayment separately without changing the underlying calculation', () => {
    payments.set([{ ...paymentFixture(), amount: 110000 }]);
    const page = create(WorkOrderFinanceComponent).componentInstance;
    expect(page.summary().remaining).toBe('0');
    expect(page.summary().overpaid).toBe('10,000');
  });
  it('shows Not set for an undefined work price and keeps Paid and Materials available', () => {
    order.set({ ...orderFixture(), workPrice: undefined });
    const fixture = create(WorkOrderFinanceComponent);
    expect(fixture.componentInstance.summary().remaining).toBeUndefined();
    expect(
      fixture.nativeElement.querySelector('[data-finance="remaining"]').textContent,
    ).toContain('MASTER_PLANNER_CRM.NOT_SET');
    expect(fixture.componentInstance.summary().paid).toBe('30,000');
  });
  it('reactively formats numbers with the current application locale', () => {
    const page = create(WorkOrderFinanceComponent).componentInstance;
    locale.set('ru-RU');
    expect(page.summary().paid).toBe(new Intl.NumberFormat('ru-RU').format(30000));
    expect(page.materialRows()[0].total).toBe(
      new Intl.NumberFormat('ru-RU').format(1000),
    );
  });
  it('updates dates in existing payment rows when the application locale changes', () => {
    const fixture = create(WorkOrderFinanceComponent);
    const paymentDate = (): string =>
      fixture.nativeElement.querySelector('.payments .record > span').textContent;
    expect(paymentDate()).toBe('11/10/2026');
    locale.set('ru-RU');
    fixture.detectChanges();
    expect(paymentDate()).toBe('11.10.2026');
  });
  it('keeps completed orders editable and opens forms with the correct work order/record', async () => {
    order.set({ ...order()!, status: 'completed', completedAt: 1 });
    const page = create(WorkOrderFinanceComponent).componentInstance;
    await page.editPayment();
    await page.editPayment(payments()[0]);
    await page.editMaterial(materials()[0]);
    expect(dialog.open.calls.argsFor(0)[0]).toBe(PaymentFormDialogComponent);
    expect(dialog.open.calls.argsFor(1)[1].data).toEqual({
      workOrderId: 'o1',
      payment: payments()[0],
    });
    expect(dialog.open.calls.argsFor(2)[0]).toBe(MaterialFormDialogComponent);
    expect(page.readOnly()).toBeFalse();
  });
  it('shows archived history but hides and blocks every financial mutation', async () => {
    order.set({ ...order()!, archivedAt: 1 });
    const fixture = create(WorkOrderFinanceComponent);
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
    expect(page.payments().length).toBe(1);
    expect(page.materials().length).toBe(1);
    expect(page.summary().paid).toBe('30,000');
    await page.editPayment();
    await page.editMaterial();
    await page.deletePayment(payments()[0]);
    await page.deleteMaterial(materials()[0]);
    expect(dialog.open).not.toHaveBeenCalled();
    expect(data.deletePayment).not.toHaveBeenCalled();
    expect(data.deleteMaterial).not.toHaveBeenCalled();
  });
  it('blocks payment saves when the order becomes archived while a form is open', async () => {
    const form = create(PaymentFormDialogComponent).componentInstance;
    form.form.controls.amount.setValue(10);
    order.set({ ...order()!, archivedAt: 1 });
    await form.submit();
    expect(data.savePayment).not.toHaveBeenCalled();
    expect(form.canEdit()).toBeFalse();
  });
  it('blocks material saves for an archived work order', async () => {
    order.set({ ...order()!, archivedAt: 1 });
    const form = create(MaterialFormDialogComponent).componentInstance;
    form.form.patchValue({ name: 'Cable', quantity: 1, unitPrice: 100 });
    await form.submit();
    expect(data.saveMaterial).not.toHaveBeenCalled();
    expect(form.canEdit()).toBeFalse();
  });
});
