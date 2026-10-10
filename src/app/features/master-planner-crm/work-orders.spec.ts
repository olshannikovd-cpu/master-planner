import { computed, Signal, signal, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { DateTimeFormatService } from '../../core/date-time-format/date-time-format.service';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import {
  Customer,
  MasterPlannerDraft,
  WorkOrder,
  WorkOrderStatus,
  WorkSite,
} from '../master-planner-data/master-planner-data.model';
import {
  customerFixture,
  orderFixture,
  siteFixture,
} from '../master-planner-data/master-planner-data.test-helper';
import { WorkOrdersPageComponent } from './work-orders-page.component';
import { WorkOrderDetailComponent } from './work-order-detail.component';
import {
  WorkOrderFormDialogComponent,
  WorkOrderFormData,
} from './work-order-form-dialog.component';
import { CustomerDetailComponent } from './customer-detail.component';
import { SiteDetailComponent } from './site-detail.component';
import { withWorkOrderStatus } from './work-order-ui.util';

interface WorkOrderTestData {
  getCustomers: () => Signal<Customer[]>;
  getWorkSites: () => Signal<WorkSite[]>;
  getWorkOrders: () => Signal<WorkOrder[]>;
  getCustomer: (id: string) => Signal<Customer | undefined>;
  getWorkSite: (id: string) => Signal<WorkSite | undefined>;
  getWorkOrder: (id: string) => Signal<WorkOrder | undefined>;
  getWorkSitesForCustomer: (id: string) => Signal<WorkSite[]>;
  getWorkOrdersForCustomer: jasmine.Spy;
  getWorkOrdersForSite: jasmine.Spy;
  createWorkOrder: jasmine.Spy;
  saveWorkOrder: jasmine.Spy;
  archiveWorkOrder: jasmine.Spy;
}

describe('Work orders UI', () => {
  let customers = signal<Customer[]>([]);
  let sites = signal<WorkSite[]>([]);
  let orders = signal<WorkOrder[]>([]);
  let dialog: { open: jasmine.Spy };
  let ref: { close: jasmine.Spy; disableClose: boolean };
  const makeData = (): WorkOrderTestData => ({
    getCustomers: () => customers,
    getWorkSites: () => sites,
    getWorkOrders: () => orders,
    getCustomer: (id: string) =>
      computed(() => customers().find((record) => record.id === id)),
    getWorkSite: (id: string) =>
      computed(() => sites().find((record) => record.id === id)),
    getWorkOrder: (id: string) =>
      computed(() => orders().find((record) => record.id === id)),
    getWorkSitesForCustomer: (id: string) =>
      computed(() => sites().filter((record) => record.customerId === id)),
    getWorkOrdersForCustomer: jasmine
      .createSpy('getWorkOrdersForCustomer')
      .and.callFake((id: string) =>
        computed(() => orders().filter((record) => record.customerId === id)),
      ),
    getWorkOrdersForSite: jasmine
      .createSpy('getWorkOrdersForSite')
      .and.callFake((id: string) =>
        computed(() => orders().filter((record) => record.workSiteId === id)),
      ),
    createWorkOrder: jasmine
      .createSpy('createWorkOrder')
      .and.callFake((draft: MasterPlannerDraft<WorkOrder>) => ({
        ...orderFixture('new-order'),
        ...draft,
      })),
    saveWorkOrder: jasmine
      .createSpy('saveWorkOrder')
      .and.callFake(async (order: WorkOrder) => {
        orders.update((records) => [
          ...records.filter((record) => record.id !== order.id),
          order,
        ]);
      }),
    archiveWorkOrder: jasmine
      .createSpy('archiveWorkOrder')
      .and.callFake(async (id: string) => {
        orders.update((records) =>
          records.map((record) =>
            record.id === id ? { ...record, archivedAt: 1 } : record,
          ),
        );
      }),
  });
  let data: ReturnType<typeof makeData>;
  let navigate: jasmine.Spy;

  beforeEach(() => {
    customers = signal([
      { ...customerFixture('c1'), name: 'Alice' },
      { ...customerFixture('c2'), name: 'Bob' },
      { ...customerFixture('c3'), name: 'Archived owner', archivedAt: 1 },
    ]);
    sites = signal([
      { ...siteFixture('s1', 'c1'), name: 'Workshop' },
      siteFixture('s2', 'c2'),
      { ...siteFixture('s3', 'c3'), archivedAt: 1 },
    ]);
    orders = signal([
      {
        ...orderFixture('o1', 'c1', 's1'),
        title: 'Repair',
        description: 'Replace pipe',
        scheduledDay: '2026-10-10',
        scheduledStart: 570,
        scheduledEnd: 600,
        workPrice: 0,
      },
      { ...orderFixture('o2', 'c1', 's1'), status: 'waiting' },
      { ...orderFixture('archived', 'c1', 's1'), archivedAt: 1 },
    ]);
    data = makeData();
    dialog = {
      open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(true) }),
    };
    ref = { close: jasmine.createSpy('close'), disableClose: false };
  });

  const create = <T>(
    component: Type<T>,
    input: WorkOrderFormData = {},
    id = 'o1',
  ): ComponentFixture<T> => {
    const paramMap = convertToParamMap({ id });
    TestBed.configureTestingModule({
      imports: [component, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(paramMap), snapshot: { paramMap } },
        },
        { provide: MasterPlannerDataService, useValue: data },
        { provide: MatDialog, useValue: dialog },
        { provide: MAT_DIALOG_DATA, useValue: input },
        { provide: MatDialogRef, useValue: ref },
        { provide: DateTimeFormatService, useValue: { currentLocale: signal('en-GB') } },
      ],
    });
    const fixture = TestBed.createComponent(component);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();
    return fixture;
  };

  it('lists only nonarchived orders by default and shows archives separately', () => {
    const page = create(WorkOrdersPageComponent).componentInstance;
    expect(page.orders().map((order) => order.id)).toEqual(['o1', 'o2']);
    page.showArchived.set(true);
    expect(page.orders().map((order) => order.id)).toEqual(['archived']);
  });
  it('filters by status', () => {
    const page = create(WorkOrdersPageComponent).componentInstance;
    page.status.set('waiting');
    expect(page.orders().map((order) => order.id)).toEqual(['o2']);
    page.status.set('completed');
    expect(page.orders()).toEqual([]);
    page.status.set('');
    expect(page.orders().length).toBe(2);
  });
  it('searches title, description, customer and site with case insensitive input', () => {
    orders.set([orders()[0]]);
    const page = create(WorkOrdersPageComponent).componentInstance;
    for (const term of [' REPAIR ', 'PIPE', 'alice', 'workshop']) {
      page.search.set(term);
      expect(page.orders().length).withContext(term).toBe(1);
    }
    page.search.set('absent');
    expect(page.orders()).toEqual([]);
  });
  it('opens create and navigates to the new card', async () => {
    const page = create(WorkOrdersPageComponent).componentInstance;
    dialog.open.and.returnValue({ afterClosed: () => of('new-order') });
    await page.addWorkOrder();
    expect(dialog.open.calls.mostRecent().args[0]).toBe(WorkOrderFormDialogComponent);
    expect(navigate).toHaveBeenCalledWith(['/work-orders', 'new-order']);
  });
  it('creates via the data factory, trims text, and stores minutes and zero price', async () => {
    const form = create(WorkOrderFormDialogComponent, {
      customerId: 'c1',
      workSiteId: 's1',
    }).componentInstance;
    form.form.patchValue({
      title: ' Repair ',
      description: ' Pipe ',
      scheduledDay: '2026-10-10',
      startTime: '09:30',
      endTime: '24:00',
      workPrice: 0,
    });
    await form.submit();
    expect(data.createWorkOrder).toHaveBeenCalledWith(
      jasmine.objectContaining({
        customerId: 'c1',
        workSiteId: 's1',
        title: 'Repair',
        description: 'Pipe',
        scheduledStart: 570,
        scheduledEnd: 1440,
        workPrice: 0,
      }),
    );
    expect(ref.close).toHaveBeenCalledWith('new-order');
  });
  it('edits without a new ID and clears removed optional schedule/site/price values', async () => {
    const original = { ...orders()[0], taskIds: ['existing-task'] };
    const form = create(WorkOrderFormDialogComponent, {
      order: original,
    }).componentInstance;
    form.form.patchValue({
      title: ' Changed ',
      workSiteId: '',
      scheduledDay: '',
      startTime: '',
      endTime: '',
      workPrice: null,
    });
    // The committed lookup normally owns the same original record, including future fields.
    orders.update((records) =>
      records.map((record) => (record.id === original.id ? original : record)),
    );
    await form.submit();
    expect(data.createWorkOrder).not.toHaveBeenCalled();
    expect(data.saveWorkOrder).toHaveBeenCalledWith(
      jasmine.objectContaining({
        id: 'o1',
        createdAt: original.createdAt,
        title: 'Changed',
        taskIds: ['existing-task'],
        workSiteId: undefined,
        scheduledDay: undefined,
        scheduledStart: undefined,
        scheduledEnd: undefined,
        workPrice: undefined,
      }),
    );
  });
  it('requires an active customer and a nonblank title', async () => {
    const form = create(WorkOrderFormDialogComponent).componentInstance;
    form.form.patchValue({ title: ' ' });
    await form.submit();
    expect(form.form.invalid).toBeTrue();
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
  it('filters sites by the selected customer and clears a mismatched site on change', () => {
    const form = create(WorkOrderFormDialogComponent, {
      customerId: 'c1',
      workSiteId: 's1',
    }).componentInstance;
    expect(form.customers().map((customer) => customer.id)).toEqual(['c1', 'c2']);
    expect(form.sites().map((site) => site.id)).toEqual(['s1']);
    form.form.controls.customerId.setValue('c2');
    TestBed.tick();
    expect(form.form.controls.workSiteId.value).toBe('');
    expect(form.sites().map((site) => site.id)).toEqual(['s2']);
  });
  it('rejects assigning another customer site or an archived customer to a new order', async () => {
    const form = create(WorkOrderFormDialogComponent, {
      customerId: 'c1',
      workSiteId: 's2',
    }).componentInstance;
    form.form.controls.title.setValue('Repair');
    await form.submit();
    expect(form.form.controls.workSiteId.invalid).toBeTrue();
    form.form.patchValue({ customerId: 'c3', workSiteId: '' });
    await form.submit();
    expect(form.form.controls.customerId.invalid).toBeTrue();
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
  it('preserves existing archived customer/site links when editing', async () => {
    const order = { ...orders()[0], customerId: 'c3', workSiteId: 's3' };
    orders.set([order]);
    const form = create(WorkOrderFormDialogComponent, { order }).componentInstance;
    expect(form.archivedOwner()?.id).toBe('c3');
    expect(form.archivedSite()?.id).toBe('s3');
    form.form.controls.title.setValue('Changed');
    await form.submit();
    expect(data.saveWorkOrder).toHaveBeenCalledWith(
      jasmine.objectContaining({
        id: 'o1',
        customerId: 'c3',
        workSiteId: 's3',
        title: 'Changed',
      }),
    );
  });
  it('rejects invalid dates, prices and clock times including end <= start', async () => {
    const form = create(WorkOrderFormDialogComponent, {
      customerId: 'c1',
    }).componentInstance;
    form.form.controls.title.setValue('Repair');
    for (const patch of [
      { startTime: '24:00', endTime: '' },
      { startTime: '10:00', endTime: '09:30' },
      { startTime: '10:00', endTime: '10:00' },
      { startTime: '', endTime: '00:00' },
    ]) {
      form.form.patchValue(patch);
      await form.submit();
      expect(form.form.invalid).withContext(JSON.stringify(patch)).toBeTrue();
    }
    form.form.patchValue({
      startTime: '',
      endTime: '',
      scheduledDay: '2026-02-30',
      workPrice: -1,
    });
    await form.submit();
    expect(form.form.controls.scheduledDay.invalid).toBeTrue();
    expect(form.form.controls.workPrice.invalid).toBeTrue();
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
  it('sets completion time through editing and removes it on reopening', async () => {
    const form = create(WorkOrderFormDialogComponent, {
      order: orders()[0],
    }).componentInstance;
    form.form.controls.status.setValue('completed');
    await form.submit();
    expect(orders()[orders().length - 1].completedAt).toEqual(jasmine.any(Number));
    form.form.controls.status.setValue('planned');
    await form.submit();
    expect(orders()[orders().length - 1].completedAt).toBeUndefined();
  });
  it('keeps a failed save open for retry', async () => {
    const form = create(WorkOrderFormDialogComponent, {
      order: orders()[0],
    }).componentInstance;
    data.saveWorkOrder.and.rejectWith(new Error('synthetic failure'));
    await form.submit();
    expect(form.failed()).toBeTrue();
    expect(ref.close).not.toHaveBeenCalled();
    expect(form.form.enabled).toBeTrue();
  });
  it('retries creating an order with the same ID after a failed save', async () => {
    const form = create(WorkOrderFormDialogComponent, {
      customerId: 'c1',
    }).componentInstance;
    form.form.controls.title.setValue('Repair');
    const save = data.saveWorkOrder.and.callFake(async (order: WorkOrder) => {
      if (data.saveWorkOrder.calls.count() === 1) throw new Error('synthetic failure');
      orders.update((records) => [...records, order]);
    });
    await form.submit();
    expect(form.failed()).toBeTrue();
    expect(ref.close).not.toHaveBeenCalled();
    form.form.controls.title.setValue('Repair updated');
    await form.submit();
    expect(data.createWorkOrder).toHaveBeenCalledTimes(1);
    expect(save.calls.allArgs().map(([order]) => order.id)).toEqual([
      'new-order',
      'new-order',
    ]);
    expect(orders().filter((order) => order.id === 'new-order').length).toBe(1);
    expect(orders().find((order) => order.id === 'new-order')?.title).toBe(
      'Repair updated',
    );
    expect(form.failed()).toBeFalse();
    expect(ref.close).toHaveBeenCalledOnceWith('new-order');
  });
  it('passes the existing order into edit and renders customer/site/tel links', async () => {
    const fixture = create(WorkOrderDetailComponent);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('a[href="/customers/c1"]')).not.toBeNull();
    expect(element.querySelector('a[href="/sites/s1"]')).not.toBeNull();
    expect(element.querySelector('a[href^="tel:"]')).not.toBeNull();
    expect(fixture.componentInstance.time()).toBe('09:30 – 10:00');
    expect(fixture.componentInstance.price()).toBe('0');
    await fixture.componentInstance.edit();
    expect(dialog.open.calls.mostRecent().args[1].data).toEqual({ order: orders()[0] });
  });
  it('applies quick status transitions and keeps completed/cancelled orders nonarchived', async () => {
    const page = create(WorkOrderDetailComponent).componentInstance;
    for (const status of [
      'in_progress',
      'waiting',
      'completed',
      'cancelled',
    ] as WorkOrderStatus[]) {
      await page.changeStatus(status);
      expect(page.order()?.status).toBe(status);
      expect(page.order()?.archivedAt).toBeUndefined();
      if (status === 'completed')
        expect(page.order()?.completedAt).toEqual(jasmine.any(Number));
      else expect(page.order()?.completedAt).toBeUndefined();
    }
  });
  it('requires confirmation to archive, returns to the list, and preserves other entities', async () => {
    const page = create(WorkOrderDetailComponent).componentInstance;
    dialog.open.and.returnValue({ afterClosed: () => of(false) });
    await page.archive();
    expect(data.archiveWorkOrder).not.toHaveBeenCalled();
    dialog.open.and.returnValue({ afterClosed: () => of(true) });
    await page.archive();
    expect(data.archiveWorkOrder).toHaveBeenCalledOnceWith('o1');
    expect(navigate).toHaveBeenCalledWith(['/work-orders']);
    expect(
      customers().every(
        (customer) => customer.id !== 'c1' || customer.archivedAt === undefined,
      ),
    ).toBeTrue();
    expect(sites()[0].archivedAt).toBeUndefined();
  });
  it('lists customer orders via the data API and preselects the customer when creating', async () => {
    const page = create(CustomerDetailComponent, {}, 'c1').componentInstance;
    expect(page.orders().map((order) => order.id)).toEqual(['o1', 'o2']);
    expect(data.getWorkOrdersForCustomer).toHaveBeenCalledWith('c1');
    dialog.open.and.returnValue({ afterClosed: () => of('new-order') });
    await page.addWorkOrder();
    expect(dialog.open.calls.mostRecent().args[1].data).toEqual({ customerId: 'c1' });
    expect(navigate).toHaveBeenCalledWith(['/work-orders', 'new-order']);
  });
  it('lists site orders via the data API and preselects customer and site when creating', async () => {
    const page = create(SiteDetailComponent, {}, 's1').componentInstance;
    expect(page.orders().map((order) => order.id)).toEqual(['o1', 'o2']);
    expect(data.getWorkOrdersForSite).toHaveBeenCalledWith('s1');
    dialog.open.and.returnValue({ afterClosed: () => of('new-order') });
    await page.addWorkOrder();
    expect(dialog.open.calls.mostRecent().args[1].data).toEqual({
      customerId: 'c1',
      workSiteId: 's1',
    });
    expect(navigate).toHaveBeenCalledWith(['/work-orders', 'new-order']);
  });
});

describe('Work order status semantics', () => {
  it('sets completedAt once, retains it on completed edits, and clears it on every other status', () => {
    const completed = withWorkOrderStatus(orderFixture(), 'completed', 1234);
    expect(completed.completedAt).toBe(1234);
    expect(withWorkOrderStatus(completed, 'completed', 5678).completedAt).toBe(1234);
    for (const status of [
      'planned',
      'in_progress',
      'waiting',
      'cancelled',
    ] as WorkOrderStatus[])
      expect(withWorkOrderStatus(completed, status).completedAt).toBeUndefined();
    expect(completed.completedAt).toBe(1234);
  });
});
