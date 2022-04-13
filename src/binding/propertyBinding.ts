import { BindingHandler } from './bindingHandlers';
import { BindingContext } from './bindingContext';
import { IArraySplice, observable, extendObservable } from 'mobx';
import { PROPERTY_SETTER_SYMBOL } from '../imagine';

export class PropertyHandler implements BindingHandler {
    init(element: HTMLElement, value: any, context: BindingContext, updateValue: (value: any) => void): void {
        setTimeout(() => { // Move init to back of callstack, so Custom Element is initialized first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
            let propertyName: string = context.parameter!;

            let caseSensitiveDescriptor: { descriptor: PropertyDescriptor, caseSensitiveName: string } | null = getPropertyDescriptorFromPrototypeChain(element, propertyName);
            if (caseSensitiveDescriptor) { // configure existing property
                if (typeof caseSensitiveDescriptor.descriptor.value === 'function') {
                    /* CASE 1: The WebComponent exposes a function.
                     * bind an outlet in our VM to this function, so it will be callable
                     * from the VM
                     */
                    context.vm[context.propertyName] = caseSensitiveDescriptor.descriptor.value.bind(element);
                    context.parameter = undefined; // don't further update this parameter
                }
                else if (typeof value === 'function') {
                    /* CASE 2: We're passing a function from the VM to the WebComponent
                     * assume the WebComponent accepts this function (maybe for callbacks)
                     * and just leave it at that, don't create getters / setters
                     */
                    (<any>element)[caseSensitiveDescriptor.caseSensitiveName] = value;
                    context.parameter = undefined; // don't further update this parameter
                }
                else {
                    /* CASE 3: We're two-way binding a property of the WebComponent to
                     * a property on the VM
                     */
                    context.parameter = caseSensitiveDescriptor.caseSensitiveName; // update the context to match the real properyname
                    bindProperties(caseSensitiveDescriptor, element, context, updateValue);
                }
            }
            /* TODO: D.R.Y.!!! The code below is largely the same as for the case where we bind an existing property */
            else { // create new property
                if (typeof value === 'function') {
                    /* CASE 2: We're passing a function from the VM to the WebComponent
                     * assume the WebComponent accepts this function (maybe for callbacks)
                     * and just leave it at that, don't create getters / setters
                     */
                    (<any>element)[propertyName] = value;
                    context.parameter = undefined; // don't further update this parameter
                }
                else {
                    /* CASE 4: We're two-way binding a newly created property of the WebComponent
                     * to a property on the VM
                     */
                    let dummyObservableValue: any = observable.box();
                    let realValue: any;
                    let newProperties: object = {};

                    Object.defineProperty(newProperties, propertyName, {
                        enumerable: true,
                        configurable: true,
                        get: (): any => {
                            dummyObservableValue.get(); // just to trigger tracking -- mobx creates an computed around this getter/setter and needs an observable to track within.
                            return realValue; // don't return the observable value however, becauses in case of a plain object it gets wrapped by mobx (proxied) and we want the original value, not the proxy
                        },
                        set: (value: any): void => {
                            dummyObservableValue.set(value); // just to trigger tracking
                            realValue = value; // store unwrapped original

                            if (!context.preventCircularUpdate) {
                                context.preventCircularUpdate = true;
                                updateValue(value);
                            }
                            context.preventCircularUpdate = false;
                        }
                    });

                    extendObservable(element, newProperties);
                }
            }
        }, 0);
    }

    update(element: HTMLElement, value: string, context: BindingContext, change: IArraySplice<any>): void {
        if (context.parameter) {
            setTimeout(() => { // Move update to back of callstack, so Custom Element is initialized first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
                context.preventCircularUpdate = true;
                (<any>element)[context.parameter!] = value;
            }, 0);
        }
    }
}

function bindProperties(caseSensitiveDescriptor: { descriptor: PropertyDescriptor, caseSensitiveName: string }, element: HTMLElement, context: BindingContext, updateValue: (value: any) => void) {
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

    Object.defineProperty(element, caseSensitiveDescriptor.caseSensitiveName, {
        enumerable: caseSensitiveDescriptor.descriptor.enumerable || false,
        configurable: true, // Whatever the original was, we need to be able to change this property from now on
        get: caseSensitiveDescriptor!.descriptor.get,
        set: (value: any): void => {
            if (originalSetter) {
                originalSetter.call(element, value);
            }

            //console.log('UPDATE PROP:', !context.preventCircularUpdate)
            if (!context.preventCircularUpdate) {
                updateValue(value);
            }

            context.preventCircularUpdate = false;
        }
    });

    let newDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(element, caseSensitiveDescriptor.caseSensitiveName)!;
    (<any>newDescriptor.set)[PROPERTY_SETTER_SYMBOL] = originalSetter;
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
