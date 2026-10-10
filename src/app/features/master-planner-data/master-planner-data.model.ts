interface RecordMetadata {
  id: string;
  createdAt: number;
  updatedAt: number;
}

interface ArchivableRecord extends RecordMetadata {
  archivedAt?: number;
}

export interface Customer extends ArchivableRecord {
  recordType: 'customer';
  name: string;
  phone: string;
  phone2?: string;
  email?: string;
  notes?: string;
}

export interface WorkSite extends ArchivableRecord {
  recordType: 'site';
  customerId: string;
  name: string;
  address: string;
  notes?: string;
}

export type WorkOrderStatus =
  | 'planned'
  | 'in_progress'
  | 'waiting'
  | 'completed'
  | 'cancelled';

export interface WorkOrder extends ArchivableRecord {
  recordType: 'order';
  customerId: string;
  workSiteId?: string;
  title: string;
  description?: string;
  status: WorkOrderStatus;
  scheduledDay?: string;
  /** Integer minutes from local midnight on scheduledDay: 0..1439 (not epoch). */
  scheduledStart?: number;
  /** Integer local minutes: 1..1440; 1440 means 24:00. Must exceed start if set. */
  scheduledEnd?: number;
  workPrice?: number;
  taskIds: string[];
  notes?: string;
  completedAt?: number;
}

export interface Payment extends RecordMetadata {
  recordType: 'payment';
  workOrderId: string;
  amount: number;
  date: string;
  method?: string;
  notes?: string;
}

export interface MaterialItem extends RecordMetadata {
  recordType: 'material';
  workOrderId: string;
  name: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  notes?: string;
}

export interface MasterPlannerRecordByType {
  customer: Customer;
  site: WorkSite;
  order: WorkOrder;
  payment: Payment;
  material: MaterialItem;
}

export type MasterPlannerRecordType = keyof MasterPlannerRecordByType;
export type MasterPlannerRecord = MasterPlannerRecordByType[MasterPlannerRecordType];
export type MasterPlannerDraft<T extends MasterPlannerRecord> = Omit<
  T,
  keyof RecordMetadata | 'recordType'
>;
