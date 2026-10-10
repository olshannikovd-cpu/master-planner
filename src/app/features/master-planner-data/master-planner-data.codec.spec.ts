import {
  decodeMasterPlannerRecord,
  encodeMasterPlannerRecord,
  isMasterPlannerRecord,
} from './master-planner-data.codec';
import {
  customerFixture,
  materialFixture,
  orderFixture,
  paymentFixture,
  siteFixture,
} from './master-planner-data.test-helper';
import { WORK_ORDER_STATUSES } from './master-planner-data.const';

describe('CRM codec', () => {
  for (const record of [
    customerFixture(),
    siteFixture(),
    orderFixture(),
    paymentFixture(),
    materialFixture(),
  ]) {
    it('round-trips a validated ' + record.recordType, () => {
      expect(decodeMasterPlannerRecord(encodeMasterPlannerRecord(record))).toEqual(
        JSON.parse(JSON.stringify(record)),
      );
    });
  }

  it('ignores invalid JSON and non-object JSON without throwing', () => {
    for (const json of [null, '', '{', 'null', '[]', '42', 'true', '"text"']) {
      expect(decodeMasterPlannerRecord(json)).toBeNull();
    }
  });

  it('rejects unknown record types and missing or invalid required fields', () => {
    for (const patch of [
      { recordType: 'unknown' },
      { id: '' },
      { id: 'nested:id' },
      { name: 42 },
      { phone: null },
      { createdAt: 'today' },
      { updatedAt: null },
    ]) {
      expect(
        decodeMasterPlannerRecord(JSON.stringify({ ...customerFixture(), ...patch })),
      ).toBeNull();
    }
    const { phone: removedPhone, ...missingPhone } = customerFixture();
    expect(removedPhone).toBeDefined();
    expect(decodeMasterPlannerRecord(JSON.stringify(missingPhone))).toBeNull();
  });

  it('rejects a different known recordType with incompatible required fields', () => {
    expect(
      decodeMasterPlannerRecord(
        JSON.stringify({ ...customerFixture(), recordType: 'payment' }),
      ),
    ).toBeNull();
  });

  it('accepts and preserves unknown additional JSON fields during edits', () => {
    const record = { ...customerFixture(), futureField: { enabled: true } };
    const decoded = decodeMasterPlannerRecord(JSON.stringify(record));
    expect(decoded).toEqual(record);
    expect(decoded && JSON.parse(encodeMasterPlannerRecord(decoded))).toEqual(record);
  });

  it('validates every optional customer field', () => {
    for (const key of ['phone2', 'email', 'notes', 'archivedAt']) {
      expect(
        decodeMasterPlannerRecord(JSON.stringify({ ...customerFixture(), [key]: null })),
      ).toBeNull();
    }
    expect(
      isMasterPlannerRecord({ ...customerFixture(), archivedAt: 0, notes: '' }),
    ).toBe(true);
  });

  it('accepts all order statuses and validates dates, numbers and task IDs', () => {
    for (const status of WORK_ORDER_STATUSES) {
      expect(isMasterPlannerRecord({ ...orderFixture(), status })).toBe(true);
    }
    expect(isMasterPlannerRecord({ ...orderFixture(), scheduledDay: '2024-02-29' })).toBe(
      true,
    );
    for (const patch of [
      { status: 'unknown' },
      { scheduledDay: '2023-02-29' },
      { taskIds: [42] },
      { workPrice: Infinity },
      { scheduledStart: NaN },
      { completedAt: 'today' },
      { workSiteId: null },
      { customerId: '' },
      { description: false },
    ]) {
      expect(isMasterPlannerRecord({ ...orderFixture(), ...patch })).toBe(false);
    }
  });

  it('validates site, payment and material fields', () => {
    expect(isMasterPlannerRecord({ ...siteFixture(), address: 1 })).toBe(false);
    expect(isMasterPlannerRecord({ ...paymentFixture(), date: '2024-02-30' })).toBe(
      false,
    );
    expect(isMasterPlannerRecord({ ...paymentFixture(), amount: NaN })).toBe(false);
    expect(isMasterPlannerRecord({ ...materialFixture(), quantity: Infinity })).toBe(
      false,
    );
    expect(isMasterPlannerRecord({ ...materialFixture(), unitPrice: '25' })).toBe(false);
    expect(isMasterPlannerRecord({ ...materialFixture(), unit: null })).toBe(false);
  });

  it('rejects invalid runtime input before encoding', () => {
    expect(() =>
      encodeMasterPlannerRecord({ ...customerFixture(), updatedAt: NaN }),
    ).toThrowError(TypeError);
  });
});
