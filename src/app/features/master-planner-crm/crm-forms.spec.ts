import { computed, signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import {
  Customer,
  MasterPlannerDraft,
  WorkSite,
} from '../master-planner-data/master-planner-data.model';
import {
  customerFixture,
  siteFixture,
} from '../master-planner-data/master-planner-data.test-helper';
import { CustomerFormDialogComponent } from './customer-form-dialog.component';
import {
  SiteFormDialogComponent,
  SiteFormDialogData,
} from './site-form-dialog.component';

describe('Master Planner CRM forms', () => {
  let customers = signal<Customer[]>([]);
  let sites = signal<WorkSite[]>([]);
  let ref: { close: jasmine.Spy; disableClose: boolean };
  let data: {
    getCustomers: () => typeof customers;
    getCustomer: (id: string) => ReturnType<typeof computed<Customer | undefined>>;
    getWorkSite: (id: string) => ReturnType<typeof computed<WorkSite | undefined>>;
    createCustomer: jasmine.Spy;
    createWorkSite: jasmine.Spy;
    saveCustomer: jasmine.Spy;
    saveWorkSite: jasmine.Spy;
  };

  beforeEach(() => {
    customers = signal([
      customerFixture('c1'),
      { ...customerFixture('c2'), archivedAt: 10 },
    ]);
    sites = signal([siteFixture('s1')]);
    ref = { close: jasmine.createSpy('close'), disableClose: false };
    data = {
      getCustomers: () => customers,
      getCustomer: (id) => computed(() => customers().find((record) => record.id === id)),
      getWorkSite: (id) => computed(() => sites().find((record) => record.id === id)),
      createCustomer: jasmine
        .createSpy('createCustomer')
        .and.callFake((draft: MasterPlannerDraft<Customer>) => ({
          ...customerFixture('new-c'),
          ...draft,
        })),
      createWorkSite: jasmine
        .createSpy('createWorkSite')
        .and.callFake((draft: MasterPlannerDraft<WorkSite>) => ({
          ...siteFixture('new-s'),
          ...draft,
        })),
      saveCustomer: jasmine
        .createSpy('saveCustomer')
        .and.callFake(async (record: Customer) => {
          customers.update((records) => [
            ...records.filter((existing) => existing.id !== record.id),
            record,
          ]);
        }),
      saveWorkSite: jasmine
        .createSpy('saveWorkSite')
        .and.callFake(async (record: WorkSite) => {
          sites.update((records) => [
            ...records.filter((existing) => existing.id !== record.id),
            record,
          ]);
        }),
    };
  });

  const create = <T>(
    component: Type<T>,
    input: Customer | SiteFormDialogData | null,
  ): T => {
    TestBed.configureTestingModule({
      imports: [component, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: MasterPlannerDataService, useValue: data },
        { provide: MAT_DIALOG_DATA, useValue: input },
        { provide: MatDialogRef, useValue: ref },
      ],
    });
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture.componentInstance;
  };

  it('rejects whitespace-only required customer fields', async () => {
    const form = create(CustomerFormDialogComponent, null);
    form.form.patchValue({ name: '   ', phone: '  ' });
    await form.submit();
    expect(form.form.invalid).toBeTrue();
    expect(data.createCustomer).not.toHaveBeenCalled();
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('creates a customer through the factory, trims fields, and returns the saved ID', async () => {
    const form = create(CustomerFormDialogComponent, null);
    form.form.patchValue({
      name: ' Alice ',
      phone: ' +7 (123) 45 ',
      phone2: ' 456 ',
      email: ' a@example.test ',
      notes: ' Note ',
    });
    await form.submit();
    expect(data.createCustomer).toHaveBeenCalledOnceWith({
      name: 'Alice',
      phone: '+7 (123) 45',
      phone2: '456',
      email: 'a@example.test',
      notes: 'Note',
    });
    expect(ref.close).toHaveBeenCalledOnceWith('new-c');
    expect(form.saving()).toBeFalse();
  });

  it('edits a customer without creating another ID or changing creation metadata', async () => {
    const original = customers()[0];
    const form = create(CustomerFormDialogComponent, original);
    form.form.patchValue({ name: ' Changed ', phone: ' 789 ' });
    await form.submit();
    expect(data.createCustomer).not.toHaveBeenCalled();
    expect(data.saveCustomer).toHaveBeenCalledWith(
      jasmine.objectContaining({
        id: 'c1',
        createdAt: original.createdAt,
        name: 'Changed',
        phone: '789',
      }),
    );
    expect(ref.close).toHaveBeenCalledWith('c1');
  });

  it('keeps the customer form open on failure and retries using the same factory ID', async () => {
    const form = create(CustomerFormDialogComponent, null);
    form.form.patchValue({ name: 'Alice', phone: '123' });
    data.saveCustomer.and.rejectWith(new Error('synthetic failure'));
    await form.submit();
    expect(form.failed()).toBeTrue();
    expect(form.form.enabled).toBeTrue();
    expect(ref.disableClose).toBeFalse();
    expect(ref.close).not.toHaveBeenCalled();
    data.saveCustomer.and.callFake(async (record: Customer) => {
      customers.update((records) => [...records, record]);
    });
    await form.submit();
    expect(data.createCustomer).toHaveBeenCalledTimes(1);
    expect(ref.close).toHaveBeenCalledWith('new-c');
  });

  it('waits for the committed customer signal rather than the queued save promise', async () => {
    const form = create(CustomerFormDialogComponent, null);
    form.form.patchValue({ name: 'Alice', phone: '123' });
    data.saveCustomer.and.resolveTo();
    const saving = form.submit();
    await Promise.resolve();
    TestBed.tick();
    expect(form.saving()).toBeTrue();
    expect(form.form.disabled).toBeTrue();
    expect(ref.disableClose).toBeTrue();
    expect(ref.close).not.toHaveBeenCalled();
    form.cancel();
    expect(ref.close).not.toHaveBeenCalled();
    const record = data.saveCustomer.calls.mostRecent().args[0] as Customer;
    customers.update((records) => [...records, record]);
    TestBed.tick();
    await saving;
    expect(ref.close).toHaveBeenCalledWith('new-c');
  });

  it('offers only active customers and preselects the customer from the card', () => {
    const form = create(SiteFormDialogComponent, { customerId: 'c1' });
    expect(form.customers().map((customer) => customer.id)).toEqual(['c1']);
    expect(form.form.controls.customerId.value).toBe('c1');
  });

  it('requires a customer, nonblank site name, and nonblank address', async () => {
    const form = create(SiteFormDialogComponent, {});
    form.form.patchValue({ name: ' ', address: ' ' });
    await form.submit();
    expect(form.form.invalid).toBeTrue();
    expect(data.createWorkSite).not.toHaveBeenCalled();
  });

  it('creates a site through the factory and trims text fields', async () => {
    const form = create(SiteFormDialogComponent, { customerId: 'c1' });
    form.form.patchValue({
      name: ' Workshop ',
      address: ' North road ',
      notes: ' Note ',
    });
    await form.submit();
    expect(data.createWorkSite).toHaveBeenCalledOnceWith({
      customerId: 'c1',
      name: 'Workshop',
      address: 'North road',
      notes: 'Note',
    });
    expect(ref.close).toHaveBeenCalledWith('new-s');
  });

  it('blocks archived customers for a new site', async () => {
    const form = create(SiteFormDialogComponent, { customerId: 'c2' });
    form.form.patchValue({ name: 'Workshop', address: 'North road' });
    await form.submit();
    expect(form.form.controls.customerId.invalid).toBeTrue();
    expect(data.saveWorkSite).not.toHaveBeenCalled();
  });

  it('edits a site while preserving its existing archived owner and metadata', async () => {
    const original = { ...siteFixture('s1', 'c2') };
    sites.set([original]);
    const form = create(SiteFormDialogComponent, { site: original });
    expect(form.archivedOwner()?.id).toBe('c2');
    form.form.patchValue({ address: ' Changed road ' });
    await form.submit();
    expect(data.createWorkSite).not.toHaveBeenCalled();
    expect(data.saveWorkSite).toHaveBeenCalledWith(
      jasmine.objectContaining({
        id: 's1',
        customerId: 'c2',
        createdAt: original.createdAt,
        address: 'Changed road',
      }),
    );
    expect(ref.close).toHaveBeenCalledWith('s1');
  });

  it('leaves a failed site form open for retry', async () => {
    const form = create(SiteFormDialogComponent, { site: sites()[0] });
    data.saveWorkSite.and.rejectWith(new Error('synthetic failure'));
    await form.submit();
    expect(form.failed()).toBeTrue();
    expect(form.saving()).toBeFalse();
    expect(ref.close).not.toHaveBeenCalled();
  });
});
