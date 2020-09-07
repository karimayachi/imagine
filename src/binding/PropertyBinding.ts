import { BindingHandler } from './bindingHandlers';
import { BindingContext } from './bindingContext';
import { IArraySplice, observable, extendObservable } from 'mobx';

export class PropertyHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, updateValue: (value: any) => void): void {
        setTimeout(() => { // Move init to back of callstack, so Custom Element is initialized first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
            let propertyName: string = context.parameter!;

            let caseSensitiveDescriptor: { descriptor: PropertyDescriptor, caseSensitiveName: string } | null = getPropertyDescriptorFromPrototypeChain(element, propertyName);

            if (caseSensitiveDescriptor) { // configure existing property
                context.parameter = caseSensitiveDescriptor.caseSensitiveName; // update the context to match the real properyname

                Object.defineProperty(element, caseSensitiveDescriptor.caseSensitiveName, {
                    enumerable: caseSensitiveDescriptor.descriptor.enumerable || false,
                    configurable: true, // Whatever the original was, we need to be able to change this property from now on
                    get: caseSensitiveDescriptor.descriptor.get,
                    set: (value: any): void => {
                        if (caseSensitiveDescriptor!.descriptor!.set) {
                            caseSensitiveDescriptor!.descriptor!.set!.call(element, value);
                        }
                        if (!context.preventCircularUpdate) {
                            updateValue(value);
                        }
                        context.preventCircularUpdate = false;
                    }
                });
            }
            else { // create new property
                let closureValue: any = observable.box();
                let newProperties: object = {};
                
                Object.defineProperty(newProperties, propertyName, {
                    enumerable: true,
                    configurable: true,
                    get: (): any => closureValue.get(),
                    set: (value: any): void => {
                        closureValue.set(value);
                        if (!context.preventCircularUpdate) {
                            context.preventCircularUpdate = true;
                            updateValue(value);
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
        for(let caseSensitiveDescriptorName in Object.getOwnPropertyDescriptors(obj)) {
            if(caseSensitiveDescriptorName.toLowerCase() === key) {
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