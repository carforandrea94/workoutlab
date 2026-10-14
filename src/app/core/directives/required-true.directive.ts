import { Directive } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator, Validators } from '@angular/forms';

/**
 * `required` su un ion-checkbox non basta: Angular lo tratta come un campo di
 * testo e accetta anche `false`. Per le caselle da spuntare per forza (la
 * privacy) serve requiredTrue, che per gli `<input type=checkbox>` nativi
 * Angular applica da solo ma per ion-checkbox no.
 */
@Directive({
  selector: 'ion-checkbox[requiredTrue][ngModel]',
  standalone: true,
  providers: [{ provide: NG_VALIDATORS, useExisting: RequiredTrueDirective, multi: true }]
})
export class RequiredTrueDirective implements Validator {
  validate(control: AbstractControl): ValidationErrors | null {
    return Validators.requiredTrue(control);
  }
}
