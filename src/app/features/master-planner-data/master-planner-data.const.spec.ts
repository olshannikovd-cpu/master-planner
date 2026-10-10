import { crmEntityId, MASTER_PLANNER_RECORD_TYPES } from './master-planner-data.const';
import { MAX_PLUGIN_PERSISTENCE_KEY_LENGTH } from '../../plugins/util/plugin-persistence-key.util';

describe('CRM entity keys', () => {
  it('uses a separate leaf key for every record type and ID', () => {
    for (const type of MASTER_PLANNER_RECORD_TYPES) {
      expect(crmEntityId(type, 'abc_123-XYZ')).toBe(
        'master-planner-crm:' + type + ':abc_123-XYZ',
      );
    }
    expect(crmEntityId('customer', 'a')).not.toBe(crmEntityId('customer', 'b'));
  });

  it('rejects empty or nested IDs that could broaden a prefix deletion', () => {
    for (const id of ['', ' ', 'a:b', ' a', 'a ']) {
      expect(() => crmEntityId('payment', id)).toThrowError(TypeError);
    }
  });

  it('respects the existing persistence key length limit', () => {
    const id = 'a'.repeat(MAX_PLUGIN_PERSISTENCE_KEY_LENGTH - 'material:'.length);
    expect(() => crmEntityId('material', id)).not.toThrow();
    expect(() => crmEntityId('material', id + 'a')).toThrowError(/maximum length/);
  });
});
