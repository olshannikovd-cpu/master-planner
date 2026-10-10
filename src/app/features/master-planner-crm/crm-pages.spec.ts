import { computed, signal, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { Customer, WorkSite } from '../master-planner-data/master-planner-data.model';
import {
  customerFixture,
  siteFixture,
} from '../master-planner-data/master-planner-data.test-helper';
import { CustomersPageComponent } from './customers-page.component';
import { SitesPageComponent } from './sites-page.component';
import { CustomerDetailComponent } from './customer-detail.component';
import { SiteDetailComponent } from './site-detail.component';
import { CustomerFormDialogComponent } from './customer-form-dialog.component';
import { SiteFormDialogComponent } from './site-form-dialog.component';
import { DialogConfirmComponent } from '../../ui/dialog-confirm/dialog-confirm.component';

describe('Master Planner CRM pages', () => {
  const active: Customer = {
    ...customerFixture('c1'),
    name: 'Alice',
    phone: '123',
    phone2: '456',
    email: 'alice@example.test',
  };
  const archived: Customer = { ...customerFixture('c2'), name: 'Bob', archivedAt: 10 };
  const site: WorkSite = {
    ...siteFixture('s1', 'c1'),
    name: 'Workshop',
    address: 'North road',
  };
  let customers = signal<Customer[]>([]);
  let sites = signal<WorkSite[]>([]);
  let dialog: { open: jasmine.Spy };
  let data: {
    getCustomers: () => typeof customers;
    getWorkSites: () => typeof sites;
    getCustomer: (id: string) => ReturnType<typeof computed<Customer | undefined>>;
    getWorkSite: (id: string) => ReturnType<typeof computed<WorkSite | undefined>>;
    getWorkSitesForCustomer: jasmine.Spy;
    archiveCustomer: jasmine.Spy;
    archiveWorkSite: jasmine.Spy;
  };
  let navigate: jasmine.Spy;

  beforeEach(() => {
    customers = signal([active, archived]);
    sites = signal([
      site,
      { ...siteFixture('s2', 'c1'), archivedAt: 10 },
      siteFixture('s3', 'c2'),
    ]);
    dialog = {
      open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(true) }),
    };
    data = {
      getCustomers: () => customers,
      getWorkSites: () => sites,
      getCustomer: (id) => computed(() => customers().find((record) => record.id === id)),
      getWorkSite: (id) => computed(() => sites().find((record) => record.id === id)),
      getWorkSitesForCustomer: jasmine
        .createSpy('getWorkSitesForCustomer')
        .and.callFake((id: string) =>
          computed(() => sites().filter((record) => record.customerId === id)),
        ),
      archiveCustomer: jasmine
        .createSpy('archiveCustomer')
        .and.callFake(async (id: string) => {
          customers.update((records) =>
            records.map((record) =>
              record.id === id ? { ...record, archivedAt: 20 } : record,
            ),
          );
        }),
      archiveWorkSite: jasmine
        .createSpy('archiveWorkSite')
        .and.callFake(async (id: string) => {
          sites.update((records) =>
            records.map((record) =>
              record.id === id ? { ...record, archivedAt: 20 } : record,
            ),
          );
        }),
    };
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MasterPlannerDataService, useValue: data },
        { provide: MatDialog, useValue: dialog },
      ],
    });
  });

  const create = <T>(component: Type<T>, id = 'c1'): ComponentFixture<T> => {
    const paramMap = convertToParamMap({ id });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: of(paramMap), snapshot: { paramMap } },
    });
    const fixture = TestBed.createComponent(component);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();
    return fixture;
  };

  it('lists active customers, counts active sites, and shows archives separately', () => {
    const page = create(CustomersPageComponent).componentInstance;
    expect(page.rows().map((row) => row.customer.id)).toEqual(['c1']);
    expect(page.rows()[0].siteCount).toBe(1);
    page.showArchived.set(true);
    expect(page.rows().map((row) => row.customer.id)).toEqual(['c2']);
  });

  it('searches customer name, both phones, and email with trimmed case insensitive input', () => {
    const page = create(CustomersPageComponent).componentInstance;
    for (const term of [' ALICE ', '123', '456', 'EXAMPLE.TEST']) {
      page.search.set(term);
      expect(page.rows().length).withContext(term).toBe(1);
    }
    page.search.set('absent');
    expect(page.rows()).toEqual([]);
  });

  it('opens the customer form and navigates to the created card', async () => {
    const page = create(CustomersPageComponent).componentInstance;
    dialog.open.and.returnValue({ afterClosed: () => of('new-customer') });
    await page.addCustomer();
    expect(dialog.open.calls.mostRecent().args[0]).toBe(CustomerFormDialogComponent);
    expect(navigate).toHaveBeenCalledWith(['/customers', 'new-customer']);
  });

  it('lists active sites including those of archived owners, with archives separate', () => {
    const page = create(SitesPageComponent).componentInstance;
    expect(page.rows().map((row) => row.site.id)).toEqual(['s1', 's3']);
    expect(page.rows()[1].customer?.name).toBe('Bob');
    page.showArchived.set(true);
    expect(page.rows().map((row) => row.site.id)).toEqual(['s2']);
  });

  it('searches site name, address, and customer name', () => {
    const page = create(SitesPageComponent).componentInstance;
    for (const term of [' WORKSHOP ', 'north', 'alice']) {
      page.search.set(term);
      expect(page.rows().map((row) => row.site.id))
        .withContext(term)
        .toEqual(['s1']);
    }
    page.search.set('absent');
    expect(page.rows()).toEqual([]);
  });

  it('opens the site form and navigates to the created card', async () => {
    const page = create(SitesPageComponent).componentInstance;
    dialog.open.and.returnValue({ afterClosed: () => of('new-site') });
    await page.addSite();
    expect(dialog.open.calls.mostRecent().args[0]).toBe(SiteFormDialogComponent);
    expect(navigate).toHaveBeenCalledWith(['/sites', 'new-site']);
  });

  it('loads the customer sites via the existing API and switches to archived sites', () => {
    const fixture = create(CustomerDetailComponent);
    const page = fixture.componentInstance;
    expect(page.sites().map((record) => record.id)).toEqual(['s1']);
    expect(data.getWorkSitesForCustomer).toHaveBeenCalledWith('c1');
    page.showArchivedSites.set(true);
    expect(page.sites().map((record) => record.id)).toEqual(['s2']);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('a[href="tel:123"]')).not.toBeNull();
    expect(element.querySelector('a[href="mailto:alice@example.test"]')).not.toBeNull();
  });

  it('edits the existing customer and preselects them when adding a site', async () => {
    const page = create(CustomerDetailComponent).componentInstance;
    await page.edit();
    expect(dialog.open.calls.mostRecent().args[1].data).toEqual(active);
    dialog.open.and.returnValue({ afterClosed: () => of('s-new') });
    await page.addSite();
    expect(dialog.open.calls.mostRecent().args[1].data).toEqual({ customerId: 'c1' });
    expect(navigate).toHaveBeenCalledWith(['/sites', 's-new']);
  });

  it('requires confirmation before archiving a customer without touching sites', async () => {
    const page = create(CustomerDetailComponent).componentInstance;
    const originalSites = sites();
    dialog.open.and.returnValue({ afterClosed: () => of(false) });
    await page.archive();
    expect(data.archiveCustomer).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    dialog.open.and.returnValue({ afterClosed: () => of(true) });
    await page.archive();
    expect(dialog.open.calls.mostRecent().args[0]).toBe(DialogConfirmComponent);
    expect(data.archiveCustomer).toHaveBeenCalledOnceWith('c1');
    expect(sites()).toBe(originalSites);
    expect(navigate).toHaveBeenCalledWith(['/customers']);
  });

  it('does not offer repeat archiving or adding a site for an archived customer', async () => {
    const fixture = create(CustomerDetailComponent, 'c2');
    await fixture.componentInstance.archive();
    await fixture.componentInstance.addSite();
    expect(dialog.open).not.toHaveBeenCalled();
    expect(data.archiveCustomer).not.toHaveBeenCalled();
  });

  it('links a site to its customer and phone and passes the site to editing', async () => {
    const fixture = create(SiteDetailComponent, 's1');
    expect(fixture.componentInstance.customer()?.id).toBe('c1');
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('a[href="/customers/c1"]')).not.toBeNull();
    expect(element.querySelector('a[href="tel:123"]')).not.toBeNull();
    await fixture.componentInstance.edit();
    expect(dialog.open.calls.mostRecent().args[1].data).toEqual({ site });
  });

  it('archives a site only after confirmation and returns to the list', async () => {
    const page = create(SiteDetailComponent, 's1').componentInstance;
    dialog.open.and.returnValue({ afterClosed: () => of(false) });
    await page.archive();
    expect(data.archiveWorkSite).not.toHaveBeenCalled();
    dialog.open.and.returnValue({ afterClosed: () => of(true) });
    await page.archive();
    expect(data.archiveWorkSite).toHaveBeenCalledOnceWith('s1');
    expect(navigate).toHaveBeenCalledWith(['/sites']);
  });

  it('keeps the card available when archiving fails', async () => {
    const page = create(SiteDetailComponent, 's1').componentInstance;
    data.archiveWorkSite.and.rejectWith(new Error('synthetic failure'));
    await page.archive();
    expect(page.failed()).toBeTrue();
    expect(page.busy()).toBeFalse();
    expect(navigate).not.toHaveBeenCalled();
  });
});
