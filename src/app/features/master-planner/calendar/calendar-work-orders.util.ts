import { WorkOrder } from '../../master-planner-data/master-planner-data.model';

/** Compose appointments at the calendar boundary; PlannerDay and tasks stay unchanged. */
export const groupCalendarWorkOrders = (
  orders: readonly WorkOrder[],
): ReadonlyMap<string, readonly WorkOrder[]> => {
  const grouped = new Map<string, WorkOrder[]>();
  for (const order of orders) {
    if (
      !order.scheduledDay ||
      order.archivedAt !== undefined ||
      order.status === 'cancelled'
    )
      continue;
    const day = grouped.get(order.scheduledDay) ?? [];
    day.push(order);
    grouped.set(order.scheduledDay, day);
  }
  for (const day of grouped.values())
    day.sort(
      (a, b) =>
        (a.scheduledStart ?? Infinity) - (b.scheduledStart ?? Infinity) ||
        a.title.localeCompare(b.title),
    );
  return grouped;
};
