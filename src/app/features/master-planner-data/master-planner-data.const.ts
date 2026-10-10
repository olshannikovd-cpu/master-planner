import {
  assertPluginPersistenceKey,
  composeId,
} from '../../plugins/util/plugin-persistence-key.util';
import { MasterPlannerRecordType, WorkOrderStatus } from './master-planner-data.model';

export const MASTER_PLANNER_CRM_NAMESPACE = 'master-planner-crm';
export const MASTER_PLANNER_CRM_PREFIX = MASTER_PLANNER_CRM_NAMESPACE + ':';
export const MASTER_PLANNER_RECORD_TYPES: readonly MasterPlannerRecordType[] = [
  'customer',
  'site',
  'order',
  'payment',
  'material',
];
export const WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = [
  'planned',
  'in_progress',
  'waiting',
  'completed',
  'cancelled',
];

// A record is a leaf key: ':' would turn a deletion into a descendant sweep.
// nanoid, the existing application ID generator, already satisfies this contract.
export const isCrmRecordId = (id: unknown): id is string =>
  typeof id === 'string' && id.length > 0 && id.trim() === id && !id.includes(':');

export const crmEntityId = (recordType: MasterPlannerRecordType, id: string): string => {
  if (!MASTER_PLANNER_RECORD_TYPES.includes(recordType) || !isCrmRecordId(id)) {
    throw new TypeError('Invalid CRM record key');
  }
  const key = recordType + ':' + id;
  assertPluginPersistenceKey(key);
  return composeId(MASTER_PLANNER_CRM_NAMESPACE, key);
};
