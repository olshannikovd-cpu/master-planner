import { computed, inject, Injectable, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { nanoid } from 'nanoid';
import { distinctUntilChanged, from, map, switchMap } from 'rxjs';
import { PluginUserData } from '../../plugins/plugin-persistence.model';
import { PluginUserPersistenceService } from '../../plugins/plugin-user-persistence.service';
import { selectPluginUserDataFeatureState } from '../../plugins/store/plugin-user-data.reducer';
import { decodeFromPersist } from '../../plugins/util/plugin-data-codec';
import {
  decodeMasterPlannerRecord,
  encodeMasterPlannerRecord,
  isMasterPlannerRecordOfType,
} from './master-planner-data.codec';
import { crmEntityId, MASTER_PLANNER_CRM_PREFIX } from './master-planner-data.const';
import {
  Customer,
  MasterPlannerDraft,
  MasterPlannerRecord,
  MasterPlannerRecordByType,
  MasterPlannerRecordType,
  MaterialItem,
  Payment,
  WorkOrder,
  WorkSite,
} from './master-planner-data.model';

/**
 * Native CRM facade over the existing synced plugin data; no second store or index.
 * Save promises follow PluginUserPersistenceService's contract: a rapid update
 * can resolve while queued for its per-record one-second commit window. Query
 * signals reflect committed state, including replay/restore, without an overlay.
 */
@Injectable({ providedIn: 'root' })
export class MasterPlannerDataService {
  private readonly _store = inject(Store);
  private readonly _persistence = inject(PluginUserPersistenceService);
  private readonly _mutationChains = new Map<string, Promise<void>>();
  private readonly _records = toSignal(
    this._store.select(selectPluginUserDataFeatureState).pipe(
      map((state) =>
        state.filter((entry) => entry.id.startsWith(MASTER_PLANNER_CRM_PREFIX)),
      ),
      distinctUntilChanged(
        (a, b) =>
          a.length === b.length &&
          a.every(
            (entry, index) => entry.id === b[index].id && entry.data === b[index].data,
          ),
      ),
      // Decode the captured snapshot, not loadPluginUserData's pending-write cache:
      // restore/remote replay must show the state that actually arrived. switchMap
      // prevents an older async gzip decode from replacing a newer snapshot.
      switchMap((entries) => from(this._decodeEntries(entries))),
    ),
    { initialValue: [] as MasterPlannerRecord[] },
  );
  private readonly _customers = this._ofType('customer');
  private readonly _sites = this._ofType('site');
  private readonly _orders = this._ofType('order');
  private readonly _payments = this._ofType('payment');
  private readonly _materials = this._ofType('material');

  // Queries include archived records, so history and foreign-key links remain usable.
  // Consumers can derive active-only views by filtering archivedAt.
  getCustomers(): Signal<readonly Customer[]> {
    return this._customers;
  }

  getCustomer(id: string): Signal<Customer | undefined> {
    return computed(() => this._customers().find((record) => record.id === id));
  }

  saveCustomer(customer: Customer): Promise<void> {
    return this._save(customer, 'customer');
  }

  archiveCustomer(id: string): Promise<void> {
    return this._archive('customer', id);
  }

  getWorkSites(): Signal<readonly WorkSite[]> {
    return this._sites;
  }

  getWorkSite(id: string): Signal<WorkSite | undefined> {
    return computed(() => this._sites().find((record) => record.id === id));
  }

  getWorkSitesForCustomer(customerId: string): Signal<readonly WorkSite[]> {
    return computed(() =>
      this._sites().filter((record) => record.customerId === customerId),
    );
  }

  saveWorkSite(site: WorkSite): Promise<void> {
    return this._save(site, 'site');
  }

  archiveWorkSite(id: string): Promise<void> {
    return this._archive('site', id);
  }

  getWorkOrders(): Signal<readonly WorkOrder[]> {
    return this._orders;
  }

  getWorkOrder(id: string): Signal<WorkOrder | undefined> {
    return computed(() => this._orders().find((record) => record.id === id));
  }

  getWorkOrdersForCustomer(customerId: string): Signal<readonly WorkOrder[]> {
    return computed(() =>
      this._orders().filter((record) => record.customerId === customerId),
    );
  }

  getWorkOrdersForSite(workSiteId: string): Signal<readonly WorkOrder[]> {
    return computed(() =>
      this._orders().filter((record) => record.workSiteId === workSiteId),
    );
  }

  saveWorkOrder(order: WorkOrder): Promise<void> {
    return this._save(order, 'order');
  }

  archiveWorkOrder(id: string): Promise<void> {
    return this._archive('order', id);
  }

  getPaymentsForWorkOrder(workOrderId: string): Signal<readonly Payment[]> {
    return computed(() =>
      this._payments().filter((record) => record.workOrderId === workOrderId),
    );
  }

  savePayment(payment: Payment): Promise<void> {
    return this._save(payment, 'payment');
  }

  async deletePayment(id: string): Promise<void> {
    const entityId = crmEntityId('payment', id);
    return this._mutate(entityId, () => this._persistence.removePluginUserData(entityId));
  }

  getMaterialsForWorkOrder(workOrderId: string): Signal<readonly MaterialItem[]> {
    return computed(() =>
      this._materials().filter((record) => record.workOrderId === workOrderId),
    );
  }

  saveMaterial(material: MaterialItem): Promise<void> {
    return this._save(material, 'material');
  }

  async deleteMaterial(id: string): Promise<void> {
    const entityId = crmEntityId('material', id);
    return this._mutate(entityId, () => this._persistence.removePluginUserData(entityId));
  }

  createCustomer(input: MasterPlannerDraft<Customer>): Customer {
    return { ...input, ...this._newFields(), recordType: 'customer' };
  }

  createWorkSite(input: MasterPlannerDraft<WorkSite>): WorkSite {
    return { ...input, ...this._newFields(), recordType: 'site' };
  }

  createWorkOrder(
    input: Omit<MasterPlannerDraft<WorkOrder>, 'status' | 'taskIds'> &
      Partial<Pick<WorkOrder, 'status' | 'taskIds'>>,
  ): WorkOrder {
    return {
      ...input,
      ...this._newFields(),
      recordType: 'order',
      status: input.status ?? 'planned',
      taskIds: [...(input.taskIds ?? [])],
    };
  }

  createPayment(input: MasterPlannerDraft<Payment>): Payment {
    return { ...input, ...this._newFields(), recordType: 'payment' };
  }

  createMaterial(input: MasterPlannerDraft<MaterialItem>): MaterialItem {
    return { ...input, ...this._newFields(), recordType: 'material' };
  }

  private _newFields(): { id: string; createdAt: number; updatedAt: number } {
    const now = Date.now();
    return { id: nanoid(), createdAt: now, updatedAt: now };
  }

  private _ofType<T extends MasterPlannerRecordType>(
    recordType: T,
  ): Signal<readonly MasterPlannerRecordByType[T][]> {
    return computed(() =>
      this._records().filter((record) => isMasterPlannerRecordOfType(record, recordType)),
    );
  }

  private async _decodeEntries(
    entries: PluginUserData[],
  ): Promise<MasterPlannerRecord[]> {
    const records = await Promise.all(entries.map((entry) => this._decodeEntry(entry)));
    return records.filter((record): record is MasterPlannerRecord => record !== null);
  }

  private async _decodeEntry(entry: PluginUserData): Promise<MasterPlannerRecord | null> {
    try {
      const record = decodeMasterPlannerRecord(await decodeFromPersist(entry.data));
      return record && crmEntityId(record.recordType, record.id) === entry.id
        ? record
        : null;
    } catch {
      // Skip corrupt gzip/key data without logging private content.
      return null;
    }
  }

  private async _load<T extends MasterPlannerRecordType>(
    recordType: T,
    id: string,
  ): Promise<MasterPlannerRecordByType[T] | null> {
    const record = decodeMasterPlannerRecord(
      await this._persistence.loadPluginUserData(crmEntityId(recordType, id)),
    );
    return record && record.id === id && isMasterPlannerRecordOfType(record, recordType)
      ? record
      : null;
  }

  private async _save(
    record: MasterPlannerRecord,
    expectedType: MasterPlannerRecordType,
  ): Promise<void> {
    encodeMasterPlannerRecord(record);
    if (record.recordType !== expectedType)
      throw new TypeError('Invalid CRM record type');
    const entityId = crmEntityId(record.recordType, record.id);
    return this._mutate(entityId, async () => {
      const existing = await this._load(record.recordType, record.id);
      const now = Date.now();
      await this._persistence.persistPluginUserData(
        entityId,
        encodeMasterPlannerRecord({
          ...record,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }),
      );
    });
  }

  private async _archive(
    recordType: 'customer' | 'site' | 'order',
    id: string,
  ): Promise<void> {
    const entityId = crmEntityId(recordType, id);
    return this._mutate(entityId, async () => {
      const record = await this._load(recordType, id);
      if (!record || record.archivedAt !== undefined) return;
      const now = Date.now();
      await this._persistence.persistPluginUserData(
        entityId,
        encodeMasterPlannerRecord({ ...record, archivedAt: now, updatedAt: now }),
      );
    });
  }

  // Keep local read/modify/write and deletion in invocation order. In particular,
  // a save's awaited load must not span a delete and resurrect its stale data.
  // This is an operation queue, not another copy of CRM state.
  private _mutate(entityId: string, operation: () => Promise<void>): Promise<void> {
    const previous = this._mutationChains.get(entityId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this._mutationChains.set(entityId, next);
    const cleanup = (): void => {
      if (this._mutationChains.get(entityId) === next)
        this._mutationChains.delete(entityId);
    };
    void next.then(cleanup, cleanup);
    return next;
  }
}
