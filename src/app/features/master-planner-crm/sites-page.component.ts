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
import { SiteFormDialogComponent } from './site-form-dialog.component';
import { CRM_DIALOG_SIZE, matchesCrmSearch } from './crm-ui.util';

@Component({
  selector: 'mp-sites-page',
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
  templateUrl: './sites-page.component.html',
  styleUrl: './crm-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SitesPageComponent {
  private readonly _data = inject(MasterPlannerDataService);
  private readonly _dialog = inject(MatDialog);
  private readonly _router = inject(Router);
  private readonly _sites = this._data.getWorkSites();
  private readonly _customers = this._data.getCustomers();
  readonly T = T;
  readonly search = signal('');
  readonly showArchived = signal(false);
  readonly hasActiveCustomers = computed(() =>
    this._customers().some((customer) => customer.archivedAt === undefined),
  );
  readonly rows = computed(() => {
    const customers = new Map(
      this._customers().map((customer) => [customer.id, customer]),
    );
    return this._sites()
      .map((site) => ({ site, customer: customers.get(site.customerId) }))
      .filter(
        ({ site, customer }) =>
          (site.archivedAt !== undefined) === this.showArchived() &&
          matchesCrmSearch([site.name, site.address, customer?.name], this.search()),
      );
  });

  async addSite(): Promise<void> {
    const id = await firstValueFrom(
      this._dialog
        .open(SiteFormDialogComponent, { ...CRM_DIALOG_SIZE, data: {} })
        .afterClosed(),
    );
    if (id) await this._router.navigate(['/sites', id]);
  }
}
