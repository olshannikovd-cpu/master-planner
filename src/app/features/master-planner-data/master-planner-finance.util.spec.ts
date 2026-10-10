import {
  calculateMaterialTotal,
  calculateMaterialsTotal,
  calculatePaid,
  calculateRemaining,
} from './master-planner-finance.util';

describe('CRM finance calculations', () => {
  it('calculates material quantity times unit price without modifying input', () => {
    const material = Object.freeze({ quantity: 2.5, unitPrice: 12 });
    expect(calculateMaterialTotal(material)).toBe(30);
    expect(material).toEqual({ quantity: 2.5, unitPrice: 12 });
  });
  it('sums materials and returns zero for an empty list', () => {
    expect(
      calculateMaterialsTotal([
        { quantity: 2, unitPrice: 25 },
        { quantity: 0.5, unitPrice: 20 },
      ]),
    ).toBe(60);
    expect(calculateMaterialsTotal([])).toBe(0);
  });
  it('sums payments, including refunds and an empty list', () => {
    expect(calculatePaid([{ amount: 125 }, { amount: -25 }])).toBe(100);
    expect(calculatePaid([])).toBe(0);
  });
  it('preserves an unknown price instead of inventing one', () => {
    expect(calculateRemaining(undefined, [{ amount: 100 }])).toBeUndefined();
  });
  it('calculates unpaid and overpaid balances without clamping', () => {
    expect(calculateRemaining(200, [{ amount: 125 }])).toBe(75);
    expect(calculateRemaining(0, [{ amount: 25 }])).toBe(-25);
  });
});
