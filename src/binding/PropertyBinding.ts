/// <reference path="../extension-typings.d.ts"/>
import * as ko from '../../../knockout/build/output/knockout-latest.debug';
import { AllBindings, BindingContext, Observable, PureComputed, Computed } from '../../../knockout/build/output/knockout-latest.debug';

ko.bindingHandlers['properties'] = {
    init: (element: HTMLElement, valueAccessor: any): void => {
        let properties: any = ko.unwrap(valueAccessor());

        setTimeout(() => { // Move init to back of callstack, so Custom Element is initialized first
            if (typeof properties === 'object') {
                for (let prop in properties) {
                    let descriptor: PropertyDescriptor | undefined = getPropertyDescriptorFromPrototypeChain(element, prop);

                    if (descriptor) {
                        Object.defineProperty(element, prop, {
                            enumerable: descriptor.enumerable || false,
                            configurable: descriptor.enumerable || false,
                            get: descriptor.get,
                            set: (v: any): void => {
                                if (descriptor!.set) {
                                    descriptor!.set!.call(element, v);
                                }
                                if (ko.isObservable(properties[prop]) && !properties[prop].__kowc_stopLoopback) {
                                    properties[prop](v);
                                }
                            }
                        });

                        for (let customEvent of ko.bindingHandlers['properties'].customEvents) {
                            let propertyName: string = customEvent.property;

                            if (prop === propertyName) {
                                element.addEventListener(customEvent.event, (): void => {
                                    if (ko.isObservable(properties[propertyName])) {
                                        properties[propertyName]((<any>element)[propertyName]);
                                    }
                                });
                            }
                        }
                    }
                }
            }
            else {
                throw ('Invalid syntax for properties-binding');
            }
        }, 0);
    },
    update: (element: HTMLElement & any, valueAccessor: any): void => {
        let properties: any = ko.unwrap(valueAccessor());

        /* track individual observables */
        if (typeof properties === 'object') {
            for (let prop in properties) {
                ko.unwrap(properties[prop]);
            }
        }

        setTimeout(() => { // Move update to back of callstack, so Custom Element is initialized first
            if (typeof properties === 'object') {
                for (let prop in properties) {
                    if (ko.isObservable(properties[prop])) { properties[prop].__kowc_stopLoopback = true; }
                    element[prop] = ko.unwrap(properties[prop]);
                    if (ko.isObservable(properties[prop])) { delete properties[prop].__kowc_stopLoopback; }
                }
            }
        }, 0);
    },
    addEvent: (propertyName: string, eventName: string): void => {
        ko.bindingHandlers['properties'].customEvents.push({ property: propertyName, event: eventName });
    },
    customEvents: []
};

ko.bindingHandlers['select'] = {
    init: (element: HTMLElement, valueAccessor: () => any, allBindings: AllBindings, viewmodel: any, bindingContext: BindingContext<any>) => {
        let value = valueAccessor();
        let lookupTable: { [key: string]: any[] } = {}; // Can't be a WeakMap, because we need to search by value also. Need to do manual clean-up in update...

        if (typeof value === 'object' && value.options && Array.isArray(ko.unwrap(value.options)) && typeof value.property === 'object') {
            let bindingProperty: string = Object.keys(value.property)[0];
            let bindingObservable: Observable<any> = value.property[bindingProperty];

            /* Pre-populate the lookup table and initial value */
            let initialValue: string = '';
            for(let item of ko.unwrap(value.options)) {
                let id: string = Math.random().toString(36);
                lookupTable[id] = item;
                if(item === bindingObservable()) {
                    initialValue = id;
                }
            }

            /* The lookup function relies on 'this' being the object associated with the current (clicked) option */
            let lookupFunction: Function = function (this: any): string {
                for (let index in lookupTable) {
                    if (lookupTable[index] === this.$data) {
                        return index;
                    }
                }

                let id: string = Math.random().toString(36); /* is on the fly adding still useful with pre-populating? */
                lookupTable[id] = this.$data;
                return id;
            };

            let intermediateObservable: Observable<string> = ko.observable(initialValue);

            bindingObservable.subscribe((value: any): void => {
                if((<any>bindingObservable).__kowc_stopLoopback) return;

                for (let index in lookupTable) {
                    if (lookupTable[index] === value) {
                        (<any>intermediateObservable).__kowc_stopLoopback = true;
                        intermediateObservable(index);
                        delete (<any>intermediateObservable).__kowc_stopLoopback;
                    }
                }
            });

            intermediateObservable.subscribe((value: string): void => {
                if((<any>intermediateObservable).__kowc_stopLoopback) return;

                (<any>bindingObservable).__kowc_stopLoopback = true;
                bindingObservable(lookupTable[value]);
                delete (<any>bindingObservable).__kowc_stopLoopback;
            });

            let extendedContext: BindingContext = bindingContext.extend({ '$value': lookupFunction });
            ko.applyBindingsToNode(element, { foreach: value.options, properties: { [bindingProperty]: intermediateObservable } }, extendedContext);
        }

        return { controlsDescendantBindings: true };
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