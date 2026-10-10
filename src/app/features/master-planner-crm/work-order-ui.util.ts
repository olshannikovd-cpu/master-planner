import { T } from '../../t.const';
import {
  WorkOrder,
  WorkOrderStatus,
} from '../master-planner-data/master-planner-data.model';
import { formatWorkOrderTime } from '../master-planner-data/work-order-time.util';

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  planned: T.MASTER_PLANNER_CRM.PLANNED,
  in_progress: T.MASTER_PLANNER_CRM.IN_PROGRESS,
  waiting: T.MASTER_PLANNER_CRM.WAITING,
  completed: T.MASTER_PLANNER_CRM.COMPLETED,
  cancelled: T.MASTER_PLANNER_CRM.CANCELLED,
};

export const workOrderTimeLabel = (order: WorkOrder): string => {
  const start = formatWorkOrderTime(order.scheduledStart);
  const end = formatWorkOrderTime(order.scheduledEnd);
  return start && end ? `${start} – ${end}` : start || end;
};

export const withWorkOrderStatus = (
  order: WorkOrder,
  status: WorkOrderStatus,
  now = Date.now(),
): WorkOrder => ({
  ...order,
  status,
  completedAt:
    status === 'completed'
      ? order.status === 'completed'
        ? (order.completedAt ?? now)
        : now
      : undefined,
});
