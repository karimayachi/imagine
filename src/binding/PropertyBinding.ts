import { BindingHandler } from './bindingHandlers';
import { BindingContext } from './bindingContext';
import { IArraySplice, observable, extendObservable } from 'mobx';

export class PropertyHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, updateValue: (value: any) => void): void {
        setTimeout(() => { // Move init to back of callstack, so Custom Element is initialized first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
            let propertyName: string = context.parameter!;

            /* deal with the absolutely stupid fact that attributes are case insensitive, hopefully our properties are enumerable */
            for(let caseSensitivePropertyName in element) {
                if(caseSensitivePropertyName.toLowerCase() === propertyName) {
                    propertyName = context.parameter = caseSensitivePropertyName;
                }
            }

            let descriptor: PropertyDescriptor | undefined = getPropertyDescriptorFromPrototypeChain(element, propertyName);

            if (descriptor) {
                Object.defineProperty(element, propertyName, {
                    enumerable: descriptor.enumerable || false,
                    configurable: descriptor.enumerable || false,
                    get: descriptor.get,
                    set: (value: any): void => {
                        if (descriptor!.set) {
                            descriptor!.set!.call(element, value);
                        }
                        if (!context.preventCircularUpdate) {
                            updateValue(value);
                        }
                        context.preventCircularUpdate = false;
                    }
                });
            }
            else {
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

function getPropertyDescriptorFromPrototypeChain(obj: Object, key: string): PropertyDescriptor | undefined {
    if (obj.hasOwnProperty(key)) {
        return Object.getOwnPropertyDescriptor(obj, key);
    }

    let p: any = Object.getPrototypeOf(obj);

    if (p) {
        return getPropertyDescriptorFromPrototypeChain(p, key);
    }
    else {
        return undefined;
    }
}