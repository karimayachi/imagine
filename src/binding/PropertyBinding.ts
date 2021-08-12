import { BindingHandler } from './bindingHandlers';
import { BindingContext } from './bindingContext';
import { IArraySplice, observable, extendObservable } from 'mobx';
import { PROPERTY_SETTER_SYMBOL } from '../imagine';
import { bindingEngine } from '../index';

export class PropertyHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, updateValue: (value: any) => void): void {
        setTimeout(() => { // Move init to back of callstack, so Custom Element is initialized first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
            let propertyName: string = context.parameter!;

            let caseSensitiveDescriptor: { descriptor: PropertyDescriptor, caseSensitiveName: string } | null = getPropertyDescriptorFromPrototypeChain(element, propertyName);

            if (caseSensitiveDescriptor) { // configure existing property
                context.parameter = caseSensitiveDescriptor.caseSensitiveName; // update the context to match the real properyname

                /* Check to see if we have bound this property before: the setter should than have
                 * a PROPERTY_SETTER_SYMBOL property containing the original setter
                 */
                let originalSetter: Function | undefined;
                let rebindAlreadyBoundProperty: boolean = false;

                if (caseSensitiveDescriptor!.descriptor!.set && PROPERTY_SETTER_SYMBOL in caseSensitiveDescriptor!.descriptor!.set) {
                    originalSetter = (<any>caseSensitiveDescriptor!.descriptor!.set)[PROPERTY_SETTER_SYMBOL];
                    rebindAlreadyBoundProperty = true;
                }
                else {
                    originalSetter = caseSensitiveDescriptor!.descriptor!.set;
                }

                let transform = <{ read: Function, write: Function } | null>bindingEngine.getTransformFor(element, caseSensitiveDescriptor!.caseSensitiveName!);
                /* CHECK FOR TRANSFORM ONLY ON BINDING OF THE PROPERTY.. IS THIS ENOUGH? */

                Object.defineProperty(element, caseSensitiveDescriptor.caseSensitiveName, {
                    enumerable: caseSensitiveDescriptor.descriptor.enumerable || false,
                    configurable: true, // Whatever the original was, we need to be able to change this property from now on
                    get: caseSensitiveDescriptor!.descriptor.get,
                    set: (value: any): void => {
                        if (transform && transform.read) {
                            transform.read(value);
                        }

                        if (originalSetter) {
                            if (transform && transform.read) {
                                originalSetter.call(element, transform.read(value));
                            }
                            else {
                                originalSetter.call(element, value);
                            }
                        }

                        if (!context.preventCircularUpdate) {
                            if (transform && transform.write) {
                                updateValue(transform.write(value));
                            }
                            else {
                                updateValue(value);
                            }
                        }

                        context.preventCircularUpdate = false;
                    }
                });

                let newDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(element, caseSensitiveDescriptor.caseSensitiveName)!;
                (<any>newDescriptor.set)[PROPERTY_SETTER_SYMBOL] = originalSetter;
            }
            else { // create new property
                let closureValue: any = observable.box();
                let newProperties: object = {};
                let transform = <{ read: Function, write: Function } | null>bindingEngine.getTransformFor(element, propertyName);
                /* CHECK FOR TRANSFORM ONLY ON CREATION OF THE PROPERTY.. IS THIS ENOUGH? */

                Object.defineProperty(newProperties, propertyName, {
                    enumerable: true,
                    configurable: true,
                    get: (): any => closureValue.get(),
                    set: (value: any): void => {
                        if (transform && transform.read) {
                            closureValue.set(transform.read(value));
                        }
                        else {
                            closureValue.set(value);
                        }

                        if (!context.preventCircularUpdate) {
                            context.preventCircularUpdate = true;

                            if (transform && transform.write) {
                                updateValue(transform.write(value));
                            }
                            else {
                                updateValue(value);
                            }
                        }
                        context.preventCircularUpdate = false;
                    }
                });

                extendObservable(element, newProperties);
            }
        }, 0);
    }

    update(element: HTMLElement, value: string, context: BindingContext, change: IArraySplice<any>): void {
        setTimeout(() => { // Move update to back of callstack, so Custom Element is initialized first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
            context.preventCircularUpdate = true;
            (<any>element)[context.parameter!] = value;
        }, 0);
    }
}

function getPropertyDescriptorFromPrototypeChain(obj: Object, key: string): { descriptor: PropertyDescriptor, caseSensitiveName: string } | null {
    if (obj.hasOwnProperty(key)) {
        return { descriptor: Object.getOwnPropertyDescriptor(obj, key)!, caseSensitiveName: key };
    }
    else { /* deal with the absolutely stupid fact that attributes are case insensitive, hopefully our properties are enumerable */
        for (let caseSensitiveDescriptorName in Object.getOwnPropertyDescriptors(obj)) {
            if (caseSensitiveDescriptorName.toLowerCase() === key) {
                return { descriptor: Object.getOwnPropertyDescriptors(obj)[caseSensitiveDescriptorName], caseSensitiveName: caseSensitiveDescriptorName };
            }
        }
    }

    let prototype: any = Object.getPrototypeOf(obj);

    if (prototype) {
        return getPropertyDescriptorFromPrototypeChain(prototype, key);
    }
    else {
        return null;
    }
}