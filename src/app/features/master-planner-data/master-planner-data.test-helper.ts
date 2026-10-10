import {
  Customer,
  MaterialItem,
  Payment,
  WorkOrder,
  WorkSite,
} from './master-planner-data.model';

const metadata = { createdAt: 1700000000000, updatedAt: 1700000000000 };

export const customerFixture = (id = 'c1'): Customer => ({
  ...metadata,
  id,
  recordType: 'customer',
  name: 'Test customer',
  phone: '+70000000000',
});
export const siteFixture = (id = 's1', customerId = 'c1'): WorkSite => ({
  ...metadata,
  id,
  recordType: 'site',
  customerId,
  name: 'Test site',
  address: 'Test address',
});
export const orderFixture = (
  id = 'o1',
  customerId = 'c1',
  workSiteId?: string,
): WorkOrder => ({
  ...metadata,
  id,
  recordType: 'order',
  customerId,
  workSiteId,
  title: 'Test order',
  status: 'planned',
  taskIds: [],
});
export const paymentFixture = (id = 'p1', workOrderId = 'o1'): Payment => ({
  ...metadata,
  id,
  recordType: 'payment',
  workOrderId,
  amount: 125,
  date: '2024-02-29',
});
export const materialFixture = (id = 'm1', workOrderId = 'o1'): MaterialItem => ({
  ...metadata,
  id,
  recordType: 'material',
  workOrderId,
  name: 'Test material',
  quantity: 2,
  unitPrice: 25,
});
