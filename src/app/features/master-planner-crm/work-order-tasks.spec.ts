import { computed, Signal, signal, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of } from 'rxjs';
import { TaskService } from '../tasks/task.service';
import { DEFAULT_TASK, Task } from '../tasks/task.model';
import { TaskArchiveService } from '../archive/task-archive.service';
import { NavigateToTaskService } from '../../core-ui/navigate-to-task/navigate-to-task.service';
import { SnackService } from '../../core/snack/snack.service';
import { DateTimeFormatService } from '../../core/date-time-format/date-time-format.service';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { WorkOrder } from '../master-planner-data/master-planner-data.model';
import { orderFixture } from '../master-planner-data/master-planner-data.test-helper';
import { WorkOrderTasksComponent } from './work-order-tasks.component';
import { CreateWorkOrderTaskDialogComponent } from './create-work-order-task-dialog.component';
import { LinkWorkOrderTaskDialogComponent } from './link-work-order-task-dialog.component';
import { normalizeWorkOrderTaskIds } from './work-order-task.util';
import { DialogViewArchivedTaskComponent } from '../tasks/dialog-view-archived-task/dialog-view-archived-task.component';

interface LinkingTestData {
  getWorkOrder: (id: string) => Signal<WorkOrder | undefined>;
  saveWorkOrder: jasmine.Spy;
}
const taskFixture = (id: string, changes: Partial<Task> = {}): Task => ({
  ...DEFAULT_TASK,
  id,
  title: `Task ${id}`,
  projectId: 'INBOX',
  created: 1,
  ...changes,
});

describe('Work order task linking UI', () => {
  let orders = signal<WorkOrder[]>([]);
  let live = new BehaviorSubject<Task[]>([]);
  let taskApi: {
    allTasks$: BehaviorSubject<Task[]>;
    add: jasmine.Spy;
    setSelectedId: jasmine.Spy;
    remove: jasmine.Spy;
    setDone: jasmine.Spy;
    moveToArchive: jasmine.Spy;
  };
  let archive: { getByIdBatch: jasmine.Spy };
  let navigation: { navigate: jasmine.Spy };
  let snack: { open: jasmine.Spy };
  let dialog: { open: jasmine.Spy };
  let ref: { close: jasmine.Spy; disableClose: boolean };
  let detailFixture: ComponentFixture<WorkOrderTasksComponent> | undefined;
  const makeData = (): LinkingTestData => ({
    getWorkOrder: (id: string) =>
      computed(() => orders().find((order) => order.id === id)),
    saveWorkOrder: jasmine
      .createSpy('saveWorkOrder')
      .and.callFake(async (record: WorkOrder) => {
        orders.update((records) =>
          records.map((order) => (order.id === record.id ? record : order)),
        );
        if (detailFixture?.componentInstance.order().id === record.id)
          detailFixture.componentRef.setInput('order', record);
      }),
  });
  let data: LinkingTestData;
  beforeEach(() => {
    orders = signal([
      { ...orderFixture(), taskIds: [] },
      { ...orderFixture('o2'), taskIds: [] },
    ]);
    live = new BehaviorSubject([
      taskFixture('t1', { title: 'Buy cable' }),
      taskFixture('t2', { title: 'Build panel' }),
      taskFixture('done', { isDone: true }),
    ]);
    taskApi = {
      allTasks$: live,
      add: jasmine.createSpy('add').and.callFake((title: string) => {
        live.next([...live.value, taskFixture('new-task', { title })]);
        return 'new-task';
      }),
      setSelectedId: jasmine.createSpy('setSelectedId'),
      remove: jasmine.createSpy('remove'),
      setDone: jasmine.createSpy('setDone'),
      moveToArchive: jasmine.createSpy('moveToArchive'),
    };
    archive = {
      getByIdBatch: jasmine.createSpy('getByIdBatch').and.resolveTo(new Map()),
    };
    navigation = { navigate: jasmine.createSpy('navigate').and.resolveTo() };
    snack = { open: jasmine.createSpy('open') };
    dialog = {
      open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of('t1') }),
    };
    ref = { close: jasmine.createSpy('close'), disableClose: false };
    data = makeData();
    detailFixture = undefined;
  });
  const create = <T>(component: Type<T>, id = 'o1'): ComponentFixture<T> => {
    TestBed.configureTestingModule({
      imports: [component, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: MasterPlannerDataService, useValue: data },
        { provide: TaskService, useValue: taskApi },
        { provide: TaskArchiveService, useValue: archive },
        { provide: NavigateToTaskService, useValue: navigation },
        { provide: SnackService, useValue: snack },
        { provide: MatDialog, useValue: dialog },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { workOrderId: id } },
        {
          provide: DateTimeFormatService,
          useValue: {
            currentLocale: signal('en-GB'),
            formatDate: DateTimeFormatService.prototype.formatDate,
            formatTime: DateTimeFormatService.prototype.formatTime,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(component);
    if (component === WorkOrderTasksComponent) {
      fixture.componentRef.setInput(
        'order',
        orders().find((order) => order.id === id),
      );
      detailFixture = fixture as unknown as ComponentFixture<WorkOrderTasksComponent>;
    }
    fixture.detectChanges();
    return fixture;
  };
  const setLinks = (ids: string[]): void => {
    orders.update((all) =>
      all.map((order) => (order.id === 'o1' ? { ...order, taskIds: ids } : order)),
    );
  };

  it('shows an empty work order without creating or changing anything', () => {
    const page = create(WorkOrderTasksComponent).componentInstance;
    expect(page.rows()).toEqual([]);
    expect(page.unavailable()).toBe(0);
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
    expect(taskApi.add).not.toHaveBeenCalled();
  });
  it('links an existing task through saveWorkOrder and keeps the other work fields', async () => {
    orders.update((all) => [
      { ...all[0], workPrice: 123, notes: 'Saved note', scheduledDay: '2026-10-12' },
      all[1],
    ]);
    const page = create(WorkOrderTasksComponent).componentInstance;
    await page.linkExisting();
    expect(dialog.open.calls.mostRecent().args[0]).toBe(LinkWorkOrderTaskDialogComponent);
    expect(orders()[0]).toEqual(
      jasmine.objectContaining({
        taskIds: ['t1'],
        workPrice: 123,
        notes: 'Saved note',
        scheduledDay: '2026-10-12',
      }),
    );
  });
  it('does not add duplicate links or issue another save', async () => {
    setLinks(['t1']);
    const page = create(WorkOrderTasksComponent).componentInstance;
    await page.linkExisting();
    expect(orders()[0].taskIds).toEqual(['t1']);
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
  it('normalizes blank/duplicate IDs without changing their first-occurrence order', () => {
    expect(normalizeWorkOrderTaskIds(['t2', '', 't1', 't2', ' ', 't1', 't3'])).toEqual([
      't2',
      't1',
      't3',
    ]);
  });
  it('cleans duplicates on an explicit save and preserves the order of other links', async () => {
    setLinks(['t2', '', 't1', 't2']);
    const page = create(WorkOrderTasksComponent).componentInstance;
    await page.unlink('t1');
    expect(orders()[0].taskIds).toEqual(['t2']);
  });
  it('unlink changes only CRM links and reports success', async () => {
    setLinks(['t1', 't2']);
    const page = create(WorkOrderTasksComponent).componentInstance;
    await page.unlink('t1');
    expect(orders()[0].taskIds).toEqual(['t2']);
    expect(live.value.map((task) => task.id)).toEqual(['t1', 't2', 'done']);
    expect(taskApi.remove).not.toHaveBeenCalled();
    expect(taskApi.setDone).not.toHaveBeenCalled();
    expect(taskApi.moveToArchive).not.toHaveBeenCalled();
    expect(snack.open).toHaveBeenCalled();
  });
  it('keeps a completed linked task visible', () => {
    setLinks(['done']);
    const fixture = create(WorkOrderTasksComponent);
    expect(fixture.componentInstance.rows()[0].task.isDone).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('.record').classList.contains('completed'),
    ).toBeTrue();
  });
  it('updates linked title, completed and restored state from the task engine', () => {
    setLinks(['t1']);
    const fixture = create(WorkOrderTasksComponent);
    const page = fixture.componentInstance;
    live.next(
      live.value.map((task) =>
        task.id === 't1' ? { ...task, title: 'Buy VVG cable', isDone: true } : task,
      ),
    );
    fixture.detectChanges();
    expect(page.rows()[0].task.title).toBe('Buy VVG cable');
    expect(page.rows()[0].task.isDone).toBeTrue();
    live.next(live.value.map((task) => ({ ...task, isDone: false })));
    fixture.detectChanges();
    expect(page.rows()[0].task.isDone).toBeFalse();
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
  it('uses task scheduling for display without copying it into CRM', () => {
    setLinks(['t1']);
    live.next([taskFixture('t1', { dueDay: '2026-10-12' })]);
    const page = create(WorkOrderTasksComponent).componentInstance;
    expect(page.rows()[0].schedule).toBe('12/10/2026');
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
  it('safely skips missing IDs and does not clean links while reading', async () => {
    setLinks(['missing', 't1']);
    const fixture = create(WorkOrderTasksComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.rows().map((row) => row.task.id)).toEqual(['t1']);
    expect(fixture.componentInstance.unavailable()).toBe(1);
    expect(orders()[0].taskIds).toEqual(['missing', 't1']);
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
  it('shows linked archive tasks as history and opens the existing archive viewer', async () => {
    setLinks(['archived-task']);
    const archivedTask = taskFixture('archived-task', { isDone: true });
    archive.getByIdBatch.and.resolveTo(new Map([[archivedTask.id, archivedTask]]));
    const fixture = create(WorkOrderTasksComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.rows()[0].archived).toBeTrue();
    await page.open(page.rows()[0].task, true);
    expect(dialog.open.calls.mostRecent().args[0]).toBe(DialogViewArchivedTaskComponent);
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
  it('survives an archive read failure without mutating links', async () => {
    setLinks(['missing']);
    archive.getByIdBatch.and.rejectWith(new Error('Synthetic read failure'));
    const fixture = create(WorkOrderTasksComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.rows()).toEqual([]);
    expect(orders()[0].taskIds).toEqual(['missing']);
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
  it('reflects external task deletion without changing the work order', async () => {
    setLinks(['t1']);
    const fixture = create(WorkOrderTasksComponent);
    live.next(live.value.filter((task) => task.id !== 't1'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.rows()).toEqual([]);
    expect(orders()[0].taskIds).toEqual(['t1']);
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
  it('opens an ordinary task through the standard navigation then selection API', async () => {
    setLinks(['t1']);
    const page = create(WorkOrderTasksComponent).componentInstance;
    await page.open(page.rows()[0].task, false);
    expect(navigation.navigate).toHaveBeenCalledOnceWith('t1');
    expect(taskApi.setSelectedId).toHaveBeenCalledOnceWith('t1');
  });
  it('blocks every link mutation for archived work orders but keeps Open', async () => {
    orders.update((all) => [{ ...all[0], taskIds: ['t1'], archivedAt: 1 }, all[1]]);
    const fixture = create(WorkOrderTasksComponent);
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(1);
    await page.addTask();
    await page.linkExisting();
    await page.unlink('t1');
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
    expect(dialog.open).not.toHaveBeenCalled();
    await page.open(page.rows()[0].task, false);
    expect(navigation.navigate).toHaveBeenCalled();
  });
  it('allows linking and unlinking for a completed work order', async () => {
    orders.update((all) => [{ ...all[0], status: 'completed', completedAt: 1 }, all[1]]);
    const page = create(WorkOrderTasksComponent).componentInstance;
    await page.linkExisting();
    expect(orders()[0].taskIds).toEqual(['t1']);
    await page.unlink('t1');
    expect(orders()[0].taskIds).toEqual([]);
    expect(orders()[0].status).toBe('completed');
  });
  it('creates a normal task through the API with an explicit unscheduled date key', async () => {
    const form = create(CreateWorkOrderTaskDialogComponent).componentInstance;
    form.form.controls.title.setValue(' Buy cable ');
    await form.submit();
    expect(taskApi.add).toHaveBeenCalledOnceWith(
      'Buy cable',
      false,
      { dueDay: undefined },
      false,
      true,
    );
    expect(ref.close).toHaveBeenCalledWith('new-task');
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
  it('rejects a blank task title without invoking the engine', async () => {
    const form = create(CreateWorkOrderTaskDialogComponent).componentInstance;
    form.form.controls.title.setValue('  ');
    await form.submit();
    expect(taskApi.add).not.toHaveBeenCalled();
  });
  it('reports creation failure without deleting any tasks', async () => {
    taskApi.add.and.throwError('Synthetic creation failure');
    const form = create(CreateWorkOrderTaskDialogComponent).componentInstance;
    form.form.controls.title.setValue('Buy cable');
    await form.submit();
    expect(form.failed()).toBeTrue();
    expect(ref.close).not.toHaveBeenCalled();
    expect(taskApi.remove).not.toHaveBeenCalled();
  });
  it('creates then links the returned ID using CRM without constructing another Task', async () => {
    live.next([...live.value, taskFixture('new-task')]);
    dialog.open.and.returnValue({ afterClosed: () => of('new-task') });
    const page = create(WorkOrderTasksComponent).componentInstance;
    await page.addTask();
    expect(dialog.open.calls.mostRecent().args[0]).toBe(
      CreateWorkOrderTaskDialogComponent,
    );
    expect(orders()[0].taskIds).toEqual(['new-task']);
    expect(taskApi.add).not.toHaveBeenCalled();
  });
  it('keeps a created task after CRM failure and allows a retry through Link existing', async () => {
    live.next([...live.value, taskFixture('new-task')]);
    dialog.open.and.returnValue({ afterClosed: () => of('new-task') });
    data.saveWorkOrder.and.rejectWith(new Error('Synthetic CRM failure'));
    const page = create(WorkOrderTasksComponent).componentInstance;
    await page.addTask();
    expect(page.error()).toBe('created');
    expect(orders()[0].taskIds).toEqual([]);
    expect(taskApi.remove).not.toHaveBeenCalled();
    expect(live.value.some((task) => task.id === 'new-task')).toBeTrue();
    data.saveWorkOrder.and.callFake(async (record: WorkOrder) => {
      orders.update((all) =>
        all.map((order) => (order.id === record.id ? record : order)),
      );
    });
    await page.linkExisting();
    expect(orders()[0].taskIds).toEqual(['new-task']);
    expect(page.error()).toBeNull();
    expect(taskApi.add).not.toHaveBeenCalled();
  });
  it('waits for committed CRM state after a queued link save', async () => {
    data.saveWorkOrder.and.resolveTo();
    const fixture = create(WorkOrderTasksComponent);
    const page = fixture.componentInstance;
    const linking = page.linkExisting();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(page.busy()).toBeTrue();
    expect(orders()[0].taskIds).toEqual([]);
    const saved = data.saveWorkOrder.calls.mostRecent().args[0] as WorkOrder;
    orders.update((all) => [saved, all[1]]);
    fixture.detectChanges();
    await linking;
    expect(page.busy()).toBeFalse();
  });
  it('does not mutate tasks when unlink fails', async () => {
    setLinks(['t1']);
    data.saveWorkOrder.and.rejectWith(new Error('Synthetic failure'));
    const page = create(WorkOrderTasksComponent).componentInstance;
    await page.unlink('t1');
    expect(page.error()).toBe('unlink');
    expect(orders()[0].taskIds).toEqual(['t1']);
    expect(taskApi.remove).not.toHaveBeenCalled();
  });
  it('allows two work orders to reference the same task', async () => {
    orders.update((all) => [{ ...all[0], taskIds: ['t1'] }, all[1]]);
    const page = create(WorkOrderTasksComponent, 'o2').componentInstance;
    await page.linkExisting();
    expect(orders().map((order) => order.taskIds)).toEqual([['t1'], ['t1']]);
  });
  it('searches the existing picker, excludes current links and optionally includes completed tasks', () => {
    setLinks(['t1']);
    const picker = create(LinkWorkOrderTaskDialogComponent).componentInstance;
    expect(picker.tasks().map((task) => task.id)).toEqual(['t2']);
    picker.search.set(' BUILD PANEL ');
    expect(picker.tasks().length).toBe(1);
    picker.search.set('absent');
    expect(picker.tasks()).toEqual([]);
    picker.search.set('');
    picker.showCompleted.set(true);
    expect(picker.tasks().map((task) => task.id)).toEqual(['t2', 'done']);
  });
  it('returns only an eligible selected ID from the picker', () => {
    setLinks(['t1']);
    const picker = create(LinkWorkOrderTaskDialogComponent).componentInstance;
    picker.select('t1');
    picker.select('missing');
    expect(ref.close).not.toHaveBeenCalled();
    picker.select('t2');
    expect(ref.close).toHaveBeenCalledWith('t2');
  });
  it('blocks create and picker selection when the work order becomes archived', async () => {
    const form = create(CreateWorkOrderTaskDialogComponent).componentInstance;
    form.form.controls.title.setValue('Buy cable');
    orders.update((all) => [{ ...all[0], archivedAt: 1 }, all[1]]);
    await form.submit();
    expect(taskApi.add).not.toHaveBeenCalled();
  });
  it('keeps links unchanged if a dialog is cancelled', async () => {
    dialog.open.and.returnValue({ afterClosed: () => of(undefined) });
    const page = create(WorkOrderTasksComponent).componentInstance;
    await page.linkExisting();
    await page.addTask();
    expect(data.saveWorkOrder).not.toHaveBeenCalled();
  });
});
