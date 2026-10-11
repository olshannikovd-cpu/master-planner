import { Injector, Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { ValidatorFn } from '@angular/forms';
import { filter, firstValueFrom, timeout } from 'rxjs';

export const trimmedRequired: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };

export const matchesCrmSearch = (
  values: (string | undefined)[],
  search: string,
): boolean => {
  const term = search.trim().toLocaleLowerCase();
  return values.some((value) => (value ?? '').toLocaleLowerCase().includes(term));
};

/** A queued persistence Promise is not a committed record. Keep the form open until it appears. */
export const waitForCommittedValue = <T>(
  value: Signal<T>,
  matches: (value: T) => boolean,
  injector: Injector,
): Promise<T> => {
  const current = value();
  if (matches(current)) return Promise.resolve(current);
  return firstValueFrom(
    toObservable(value, { injector }).pipe(filter(matches), timeout({ first: 10000 })),
  );
};

export const waitForCommittedRecord = <T>(
  record: Signal<T | undefined>,
  matches: (record: T) => boolean,
  injector: Injector,
): Promise<T> => {
  return waitForCommittedValue(
    record,
    (value) => value !== undefined && matches(value),
    injector,
  ) as Promise<T>;
};

export const CRM_DIALOG_SIZE = {
  width: '560px',
  maxWidth: 'calc(100vw - 2 * var(--s2))',
};
