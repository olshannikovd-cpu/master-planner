import { TestBed } from '@angular/core/testing';
import { Store, provideStore } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { MasterPlannerDataService } from './master-planner-data.service';
import { PluginUserPersistenceService } from '../../plugins/plugin-user-persistence.service';
import {
  MAX_PLUGIN_DATA_SIZE,
  MIN_PLUGIN_PERSIST_INTERVAL_MS,
  PluginUserData,
} from '../../plugins/plugin-persistence.model';
import {
  pluginUserDataReducer,
  selectPluginUserDataFeatureState,
} from '../../plugins/store/plugin-user-data.reducer';
import {
  deletePluginUserData,
  upsertPluginUserData,
} from '../../plugins/store/plugin.actions';
import { loadAllData } from '../../root-store/meta/load-all-data.action';
import { encodeForPersist, SENTINEL } from '../../plugins/util/plugin-data-codec';
import {
  decodeMasterPlannerRecord,
  encodeMasterPlannerRecord,
} from './master-planner-data.codec';
import { crmEntityId } from './master-planner-data.const';
import { MasterPlannerRecord } from './master-planner-data.model';
import {
  customerFixture,
  materialFixture,
  orderFixture,
  paymentFixture,
  siteFixture,
} from './master-planner-data.test-helper';

// Real reducers and persistence codec, not a mocked CRUD seam.
describe('MasterPlannerDataService', () => {
  let service: MasterPlannerDataService;
  let persistence: PluginUserPersistenceService;
  let store: Store;
  let now: number;

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  };
  const state = (): Promise<PluginUserData[]> =>
    firstValueFrom(store.select(selectPluginUserDataFeatureState));
  const entry = (record: MasterPlannerRecord): PluginUserData => ({
    id: crmEntityId(record.recordType, record.id),
    data: encodeMasterPlannerRecord(record),
  });
  const seed = async (records: MasterPlannerRecord[]): Promise<void> => {
    for (const record of records)
      store.dispatch(upsertPluginUserData({ pluginUserData: entry(record) }));
    await settle();
  };

  beforeEach(() => {
    now = 1800000000000;
    spyOn(Date, 'now').and.callFake(() => now);
    TestBed.configureTestingModule({
      providers: [
        provideStore({ pluginUserData: pluginUserDataReducer }),
        MasterPlannerDataService,
        PluginUserPersistenceService,
      ],
    });
    store = TestBed.inject(Store);
    service = TestBed.inject(MasterPlannerDataService);
    persistence = TestBed.inject(PluginUserPersistenceService);
  });

  it('creates independent IDs and timestamps using existing nanoid', () => {
    const first = service.createCustomer({ name: 'First', phone: '' });
    const second = service.createCustomer({ name: 'Second', phone: '' });
    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^[\w-]+$/);
    expect(first.createdAt).toBe(now);
    expect(first.updatedAt).toBe(now);
    expect(
      service.createWorkSite({ customerId: first.id, name: '', address: '' }).recordType,
    ).toBe('site');
    const tasks = ['task1'];
    const order = service.createWorkOrder({
      customerId: first.id,
      title: 'Order',
      taskIds: tasks,
    });
    tasks.push('task2');
    expect(order.taskIds).toEqual(['task1']);
    expect(order.status).toBe('planned');
    expect(
      service.createPayment({ workOrderId: order.id, amount: 0, date: '2026-10-10' })
        .recordType,
    ).toBe('payment');
    expect(
      service.createMaterial({
        workOrderId: order.id,
        name: '',
        quantity: 1,
        unitPrice: 0,
      }).recordType,
    ).toBe('material');
  });

  it('saves two customers as two records without any CRM blob or index', async () => {
    await Promise.all([
      service.saveCustomer(customerFixture('a')),
      service.saveCustomer(customerFixture('b')),
    ]);
    await settle();
    expect((await state()).map((item) => item.id).sort()).toEqual([
      crmEntityId('customer', 'a'),
      crmEntityId('customer', 'b'),
    ]);
    expect(service.getCustomers()().length).toBe(2);
    expect(service.getCustomer('a')()?.createdAt).toBe(now);
  });

  it('updates one customer without replacing another or its creation timestamp', async () => {
    await service.saveCustomer(customerFixture('a'));
    await service.saveCustomer(customerFixture('b'));
    now += MIN_PLUGIN_PERSIST_INTERVAL_MS + 1;
    await service.saveCustomer({
      ...customerFixture('a'),
      name: 'Changed',
      createdAt: 0,
    });
    await settle();
    expect(service.getCustomer('a')()?.name).toBe('Changed');
    expect(service.getCustomer('b')()?.name).toBe('Test customer');
    expect(service.getCustomer('a')()?.createdAt).toBe(1800000000000);
    expect(service.getCustomer('a')()?.updatedAt).toBe(now);
  });

  it('archives a customer without deleting related records and is idempotent', async () => {
    await seed([customerFixture(), siteFixture(), orderFixture()]);
    await service.archiveCustomer('c1');
    await settle();
    expect(service.getCustomer('c1')()?.archivedAt).toBe(now);
    expect(service.getCustomer('c1')()?.updatedAt).toBe(now);
    expect(service.getCustomer('c1')()?.createdAt).toBe(customerFixture().createdAt);
    expect(service.getCustomers()().length).toBe(1);
    expect((await state()).length).toBe(3);
    now += 1001;
    await service.archiveCustomer('c1');
    expect(
      decodeMasterPlannerRecord(
        await persistence.loadPluginUserData(crmEntityId('customer', 'c1')),
      )?.updatedAt,
    ).toBe(now - 1001);
    await service.archiveCustomer('missing');
    expect((await state()).length).toBe(3);
  });

  it('filters sites by customer and supports site save/archive', async () => {
    await service.saveWorkSite(siteFixture('s1', 'c1'));
    await service.saveWorkSite(siteFixture('s2', 'c2'));
    await settle();
    const sites = service.getWorkSitesForCustomer('c1');
    expect(sites().map((site) => site.id)).toEqual(['s1']);
    now += 1001;
    await service.archiveWorkSite('s1');
    await settle();
    expect(service.getWorkSite('s1')()?.archivedAt).toBe(now);
    expect(service.getWorkSites()().length).toBe(2);
  });

  it('filters orders by customer and site and supports order save/archive', async () => {
    await service.saveWorkOrder(orderFixture('o1', 'c1', 's1'));
    await service.saveWorkOrder(orderFixture('o2', 'c1', 's2'));
    await service.saveWorkOrder(orderFixture('o3', 'c2'));
    await settle();
    expect(
      service
        .getWorkOrdersForCustomer('c1')()
        .map((order) => order.id),
    ).toEqual(['o1', 'o2']);
    expect(
      service
        .getWorkOrdersForSite('s1')()
        .map((order) => order.id),
    ).toEqual(['o1']);
    now += 1001;
    await service.archiveWorkOrder('o1');
    await settle();
    expect(service.getWorkOrder('o1')()?.archivedAt).toBe(now);
    expect(service.getWorkOrders()().length).toBe(3);
  });

  it('saves and filters payments/materials by work order', async () => {
    await Promise.all([
      service.savePayment(paymentFixture('p1', 'o1')),
      service.savePayment(paymentFixture('p2', 'o2')),
      service.saveMaterial(materialFixture('m1', 'o1')),
      service.saveMaterial(materialFixture('m2', 'o2')),
    ]);
    await settle();
    expect(
      service
        .getPaymentsForWorkOrder('o1')()
        .map((record) => record.id),
    ).toEqual(['p1']);
    expect(
      service
        .getMaterialsForWorkOrder('o2')()
        .map((record) => record.id),
    ).toEqual(['m2']);
  });

  it('deletes only one payment and preserves other CRM records and similar IDs', async () => {
    await seed([
      paymentFixture('a'),
      paymentFixture('ab'),
      customerFixture(),
      materialFixture(),
    ]);
    const dispatch = spyOn(store, 'dispatch').and.callThrough();
    await service.deletePayment('a');
    await settle();
    expect((await state()).map((record) => record.id).sort()).toEqual([
      crmEntityId('customer', 'c1'),
      crmEntityId('material', 'm1'),
      crmEntityId('payment', 'ab'),
    ]);
    expect(dispatch).toHaveBeenCalledWith(
      deletePluginUserData({ pluginId: crmEntityId('payment', 'a') }),
    );
    expect(
      service
        .getPaymentsForWorkOrder('o1')()
        .map((record) => record.id),
    ).toEqual(['ab']);
  });

  it('deletes one material without removing a payment or another material', async () => {
    await seed([materialFixture('a'), materialFixture('ab'), paymentFixture()]);
    await service.deleteMaterial('a');
    await settle();
    expect(
      service
        .getMaterialsForWorkOrder('o1')()
        .map((record) => record.id),
    ).toEqual(['ab']);
    expect((await state()).length).toBe(2);
  });

  it('does not resurrect a record when save is immediately followed by delete', async () => {
    const saved = service.savePayment(paymentFixture());
    const removed = service.deletePayment('p1');
    await Promise.all([saved, removed]);
    await settle();
    expect((await state()).length).toBe(0);
  });

  it('updates existing query signals after external replay and full state restore', async () => {
    const customers = service.getCustomers();
    const customer = service.getCustomer('c1');
    await seed([customerFixture()]);
    expect(customers().length).toBe(1);
    store.dispatch(
      upsertPluginUserData({
        pluginUserData: entry({ ...customerFixture(), name: 'Remote edit' }),
      }),
    );
    await settle();
    expect(customer()?.name).toBe('Remote edit');
    store.dispatch({
      type: loadAllData.type,
      appDataComplete: { pluginUserData: [entry(customerFixture('restored'))] },
    });
    await settle();
    expect(customer()).toBeUndefined();
    expect(customers().map((record) => record.id)).toEqual(['restored']);
    store.dispatch(
      deletePluginUserData({ pluginId: crmEntityId('customer', 'restored') }),
    );
    await settle();
    expect(customers()).toEqual([]);
  });

  it('decodes compressed records through the existing persistence boundary', async () => {
    const record = { ...customerFixture(), notes: 'test '.repeat(1000) };
    await service.saveCustomer(record);
    expect((await state())[0].data.startsWith(SENTINEL)).toBe(true);
    await settle();
    // Gzip completion is browser asynchronous, so wait for the store's decode too.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(service.getCustomer('c1')()?.notes).toBe(record.notes);
  });

  it('ignores corrupt JSON/gzip, unrelated namespaces and mismatched record keys', async () => {
    const bad: PluginUserData[] = [
      { id: crmEntityId('customer', 'bad-json'), data: '{' },
      { id: crmEntityId('customer', 'bad-gzip'), data: SENTINEL + 'not-base64' },
      {
        id: crmEntityId('customer', 'different-id'),
        data: encodeMasterPlannerRecord(customerFixture()),
      },
      {
        id: 'another-plugin:customer:c1',
        data: encodeMasterPlannerRecord(customerFixture()),
      },
      {
        id: crmEntityId('payment', 'c1'),
        data: encodeMasterPlannerRecord(customerFixture()),
      },
    ];
    for (const pluginUserData of bad)
      store.dispatch(upsertPluginUserData({ pluginUserData }));
    await seed([customerFixture('valid')]);
    expect(
      service
        .getCustomers()()
        .map((record) => record.id),
    ).toEqual(['valid']);
  });

  it('drops an older in-flight decompression after a newer snapshot arrives', async () => {
    const old = { ...customerFixture(), notes: 'old '.repeat(2000) };
    const compressed = await encodeForPersist(encodeMasterPlannerRecord(old));
    store.dispatch(
      upsertPluginUserData({
        pluginUserData: { id: crmEntityId('customer', 'c1'), data: compressed },
      }),
    );
    await seed([{ ...customerFixture(), name: 'Latest' }]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(service.getCustomer('c1')()?.name).toBe('Latest');
  });

  it('rejects oversized records using the existing 256 KB cap', async () => {
    await expectAsync(
      service.saveCustomer({
        ...customerFixture(),
        notes: 'я'.repeat(MAX_PLUGIN_DATA_SIZE),
      }),
    ).toBeRejectedWithError(/maximum size/);
    expect(await state()).toEqual([]);
  });

  it('rejects invalid writes without modifying any record', async () => {
    await expectAsync(
      service.saveWorkOrder({ ...orderFixture(), scheduledDay: '2023-02-29' }),
    ).toBeRejectedWithError(TypeError);
    await expectAsync(
      service.saveCustomer({ ...customerFixture(), id: 'nested:id' }),
    ).toBeRejectedWithError(TypeError);
    await expectAsync(service.deletePayment('')).toBeRejectedWithError(TypeError);
    expect(await state()).toEqual([]);
  });

  it('coalesces a rapid update, emits on commit and cancels pending writes on deletion', async () => {
    jasmine.clock().install();
    try {
      await service.savePayment(paymentFixture());
      await service.savePayment({ ...paymentFixture(), amount: 200 });
      await settle();
      expect(service.getPaymentsForWorkOrder('o1')()[0].amount).toBe(125);
      expect(
        decodeMasterPlannerRecord(
          await persistence.loadPluginUserData(crmEntityId('payment', 'p1')),
        ),
      ).toEqual(jasmine.objectContaining({ amount: 200 }));
      now += MIN_PLUGIN_PERSIST_INTERVAL_MS;
      jasmine.clock().tick(MIN_PLUGIN_PERSIST_INTERVAL_MS);
      await settle();
      expect(service.getPaymentsForWorkOrder('o1')()[0].amount).toBe(200);
      await service.savePayment({ ...paymentFixture(), amount: 300 });
      const removal = service.deletePayment('p1');
      await settle();
      jasmine.clock().tick(0);
      await removal;
      now += MIN_PLUGIN_PERSIST_INTERVAL_MS;
      jasmine.clock().tick(MIN_PLUGIN_PERSIST_INTERVAL_MS);
      await settle();
      expect(await state()).toEqual([]);
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
