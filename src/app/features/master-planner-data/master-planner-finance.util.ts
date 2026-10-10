import { MaterialItem, Payment } from './master-planner-data.model';

export const calculateMaterialTotal = (
  material: Pick<MaterialItem, 'quantity' | 'unitPrice'>,
): number => material.quantity * material.unitPrice;

export const calculateMaterialsTotal = (
  materials: ReadonlyArray<Pick<MaterialItem, 'quantity' | 'unitPrice'>>,
): number =>
  materials.reduce((sum, material) => sum + calculateMaterialTotal(material), 0);

export const calculatePaid = (payments: ReadonlyArray<Pick<Payment, 'amount'>>): number =>
  payments.reduce((sum, payment) => sum + payment.amount, 0);

/** Unknown price stays unknown; a negative balance denotes an overpayment. */
export const calculateRemaining = (
  workPrice: number | undefined,
  payments: ReadonlyArray<Pick<Payment, 'amount'>>,
): number | undefined =>
  workPrice === undefined ? undefined : workPrice - calculatePaid(payments);
