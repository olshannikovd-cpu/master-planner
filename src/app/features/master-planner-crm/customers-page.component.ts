import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { T } from '../../t.const';
import { MasterPlannerDataService } from '../master-planner-data/master-planner-data.service';
import { CustomerFormDialogComponent } from './customer-form-dialog.component';
import { CRM_DIALOG_SIZE, matchesCrmSearch } from './crm-ui.util';

@Component({
  selector: 'mp-customers-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatButton,
    MatCheckbox,
    MatFormField,
    MatLabel,
    MatInput,
    TranslatePipe,
  ],
  templateUrl: './customers-page.component.html',
  styleUrl: './crm-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersPageComponent {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _dialog = inject(MatDialog);
  private readonly _router = inject(Router);
  private readonly _customers = this._data.getCustomers();
  private readonly _sites = this._data.getWorkSites();
  readonly T = T;
  readonly search = signal('');
  readonly showArchived = signal(false);
  readonly rows = computed(() => {
    const counts = new Map<string, number>();
    for (const site of this._sites()) {
      if (site.archivedAt === undefined)
        counts.set(site.customerId, (counts.get(site.customerId) ?? 0) + 1);
    }
    return this._customers()
      .filter(
        (customer) =>
          (customer.archivedAt !== undefined) === this.showArchived() &&
          matchesCrmSearch(
            [customer.name, customer.phone, customer.phone2, customer.email],
            this.search(),
          ),
      )
      .map((customer) => ({ customer, siteCount: counts.get(customer.id) ?? 0 }));
  });

  async addCustomer(): Promise<void> {
    const id = await firstValueFrom(
      this._dialog
        .open(CustomerFormDialogComponent, { ...CRM_DIALOG_SIZE, data: null })
        .afterClosed(),
    );
    if (id) await this._router.navigate(['/customers', id]);
  }
}
