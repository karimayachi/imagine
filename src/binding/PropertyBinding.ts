import { BindingHandler } from './bindingHandlers';
import { BindingContext } from './bindingContext';
import { IArraySplice } from 'mobx';

export class PropertyHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, updateValue: (value: any) => void): void {
        setTimeout(() => { // Move init to back of callstack, so Custom Element is initialized first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
            let propertyName: string = context.parameter!;
            let descriptor: PropertyDescriptor | undefined = getPropertyDescriptorFromPrototypeChain(element, propertyName);

            if (descriptor) {
                Object.defineProperty(element, propertyName, {
                    enumerable: descriptor.enumerable || false,
                    configurable: descriptor.enumerable || false,
                    get: descriptor.get,
                    set: (value: any): void => {
                        console.log('Set property value', propertyName, value);
                        if (descriptor!.set) {
                            descriptor!.set!.call(element, value);
                        }
                        if(!context.preventCircularUpdate) {
                            updateValue(value);
                        }
                        context.preventCircularUpdate = false;
                    }
                });
            }
            else {
                let closureValue: any;
                Object.defineProperty(element, propertyName, {
                    enumerable: true,
                    configurable: true,
                    get: () => closureValue,
                    set: (value: any): void => {
                        closureValue = value;
                        if(!context.preventCircularUpdate) {
                            updateValue(value);
                        }
                        context.preventCircularUpdate = false;
                    }
                });
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

// ko.bindingHandlers['properties'] = {

//     update: (element: HTMLElement & any, valueAccessor: any): void => {
//         let properties: any = ko.unwrap(valueAccessor());

//         /* track individual observables */
//         if (typeof properties === 'object') {
//             for (let prop in properties) {
//                 ko.unwrap(properties[prop]);
//             }
//         }

//         setTimeout(() => { // Move update to back of callstack, so Custom Element is initialized first
//             if (typeof properties === 'object') {
//                 for (let prop in properties) {
//                     if (ko.isObservable(properties[prop])) { properties[prop].__kowc_stopLoopback = true; }
//                     element[prop] = ko.unwrap(properties[prop]);
//                     if (ko.isObservable(properties[prop])) { delete properties[prop].__kowc_stopLoopback; }
//                 }
//             }
//         }, 0);
//     },
//     addEvent: (propertyName: string, eventName: string): void => {
//         ko.bindingHandlers['properties'].customEvents.push({ property: propertyName, event: eventName });
//     },
//     customEvents: []
// };

// ko.bindingHandlers['select'] = {
//     init: (element: HTMLElement, valueAccessor: () => any, allBindings: AllBindings, viewmodel: any, bindingContext: BindingContext<any>) => {
//         let value = valueAccessor();
//         let lookupTable: { [key: string]: any[] } = {}; // Can't be a WeakMap, because we need to search by value also. Need to do manual clean-up in update...

//         if (typeof value === 'object' && value.options && Array.isArray(ko.unwrap(value.options)) && typeof value.property === 'object') {
//             let bindingProperty: string = Object.keys(value.property)[0];
//             let bindingObservable: Observable<any> = value.property[bindingProperty];

//             /* Pre-populate the lookup table and initial value */
//             let initialValue: string = '';
//             for (let item of ko.unwrap(value.options)) {
//                 let id: string = Math.random().toString(36);
//                 lookupTable[id] = item;
//                 if (item === bindingObservable()) {
//                     initialValue = id;
//                 }
//             }

//             /* The lookup function relies on 'this' being the object associated with the current (clicked) option */
//             let lookupFunction: Function = function (this: any): string {
//                 for (let index in lookupTable) {
//                     if (lookupTable[index] === this.$data) {
//                         return index;
//                     }
//                 }

//                 let id: string = Math.random().toString(36); /* is on the fly adding still useful with pre-populating? */
//                 lookupTable[id] = this.$data;
//                 return id;
//             };

//             let intermediateObservable: Observable<string> = ko.observable(initialValue);

//             bindingObservable.subscribe((value: any): void => {
//                 if ((<any>bindingObservable).__kowc_stopLoopback) return;

//                 for (let index in lookupTable) {
//                     if (lookupTable[index] === value) {
//                         (<any>intermediateObservable).__kowc_stopLoopback = true;
//                         intermediateObservable(index);
//                         delete (<any>intermediateObservable).__kowc_stopLoopback;
//                     }
//                 }
//             });

//             intermediateObservable.subscribe((value: string): void => {
//                 if ((<any>intermediateObservable).__kowc_stopLoopback) return;

//                 (<any>bindingObservable).__kowc_stopLoopback = true;
//                 bindingObservable(lookupTable[value]);
//                 delete (<any>bindingObservable).__kowc_stopLoopback;
//             });

//             let extendedContext: BindingContext = bindingContext.extend({ '$value': lookupFunction });
//             ko.applyBindingsToNode(element, { foreach: value.options, properties: { [bindingProperty]: intermediateObservable } }, extendedContext);
//         }

//         return { controlsDescendantBindings: true };
//     }
// }

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