import { isValidDBDateStr } from '../../util/get-db-date-str';
import { isWorkOrderTimeRange } from './work-order-time.util';
import { isCrmRecordId, WORK_ORDER_STATUSES } from './master-planner-data.const';
import {
  MasterPlannerRecord,
  MasterPlannerRecordByType,
  MasterPlannerRecordType,
} from './master-planner-data.model';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isDay = (value: unknown): value is string =>
  isString(value) && isValidDBDateStr(value);
const optional = (value: unknown, validate: (value: unknown) => boolean): boolean =>
  value === undefined || validate(value);

/** Validate known fields, retaining unknown JSON fields for forward compatibility. */
export const isMasterPlannerRecord = (value: unknown): value is MasterPlannerRecord => {
  if (
    !isObject(value) ||
    !isCrmRecordId(value['id']) ||
    !isNumber(value['createdAt']) ||
    !isNumber(value['updatedAt']) ||
    !optional(value['notes'], isString)
  ) {
    return false;
  }

  switch (value['recordType']) {
    case 'customer':
      return (
        isString(value['name']) &&
        isString(value['phone']) &&
        optional(value['phone2'], isString) &&
        optional(value['email'], isString) &&
        optional(value['archivedAt'], isNumber)
      );
    case 'site':
      return (
        isCrmRecordId(value['customerId']) &&
        isString(value['name']) &&
        isString(value['address']) &&
        optional(value['archivedAt'], isNumber)
      );
    case 'order':
      return (
        isCrmRecordId(value['customerId']) &&
        optional(value['workSiteId'], isCrmRecordId) &&
        isString(value['title']) &&
        optional(value['description'], isString) &&
        WORK_ORDER_STATUSES.some((status) => status === value['status']) &&
        optional(value['scheduledDay'], isDay) &&
        isWorkOrderTimeRange(value['scheduledStart'], value['scheduledEnd']) &&
        optional(value['workPrice'], (price) => isNumber(price) && price >= 0) &&
        Array.isArray(value['taskIds']) &&
        value['taskIds'].every(isString) &&
        optional(value['completedAt'], isNumber) &&
        optional(value['archivedAt'], isNumber)
      );
    case 'payment':
      return (
        isCrmRecordId(value['workOrderId']) &&
        isNumber(value['amount']) &&
        isDay(value['date']) &&
        optional(value['method'], isString)
      );
    case 'material':
      return (
        isCrmRecordId(value['workOrderId']) &&
        isString(value['name']) &&
        isNumber(value['quantity']) &&
        optional(value['unit'], isString) &&
        isNumber(value['unitPrice'])
      );
    default:
      return false;
  }
};

export const isMasterPlannerRecordOfType = <T extends MasterPlannerRecordType>(
  record: MasterPlannerRecord,
  recordType: T,
): record is MasterPlannerRecordByType[T] => record.recordType === recordType;

export const decodeMasterPlannerRecord = (
  json: string | null,
): MasterPlannerRecord | null => {
  if (json === null) return null;
  try {
    const value: unknown = JSON.parse(json);
    return isMasterPlannerRecord(value) ? value : null;
  } catch {
    // JSON errors can contain user content: never log the payload or exception.
    return null;
  }
};

export const encodeMasterPlannerRecord = (record: MasterPlannerRecord): string => {
  if (!isMasterPlannerRecord(record)) {
    throw new TypeError('Invalid Master Planner record');
  }
  return JSON.stringify(record);
};
