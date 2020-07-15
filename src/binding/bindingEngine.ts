import { isObservableProp, observe, IValueDidChange, isObservableArray, isObservable, getAtom, computed, IComputedValue } from 'mobx';
import { BindingHandler, TextHandler, ValueHandler, OnClickHandler, ForEachHandler, AttributeHandler, WithHandler, HtmlHandler } from './bindingHandlers';
import { BindingContext } from './bindingContext';
import { PropertyHandler } from './propertyBinding';

interface BindingHandlers {
    [key: string]: BindingHandler
}

export class BindingEngine {
    static handlers: BindingHandlers = {};
    boundElements: WeakMap<HTMLElement, Map<string, BindingContext>>;
    scopes: Map<string, any>;

    constructor() {
        this.boundElements = new WeakMap<HTMLElement, Map<string, BindingContext>>();
        this.scopes = new Map<string, any>();
    }

    parseBinding = (name: string, value: string, vm: any): BindingProperties | null => {
        let bindingProperties: BindingProperties;

        let scope: any = vm;

        if (value.indexOf('.') > -1) {
            let scopeName: string = value.split('.')[0];
            value = value.split('.')[1];

            if (!this.scopes.has(scopeName)) {
                throw (`Undefined scope: ${scopeName}`);
            }
            else {
                scope = this.scopes.get(scopeName);
            }
        }

        switch (name[0]) {
            case '@':
                bindingProperties = { handler: name.substr(1), parameter: '', propertyName: value, bindingValue: null }
                break;
            case ':':
                bindingProperties = { handler: '__property', parameter: name.substr(1), propertyName: value, bindingValue: null }
                break;
            case '_':
                bindingProperties = { handler: '__attribute', parameter: name.substr(1), propertyName: value, bindingValue: null }
                break;
            default:
                return null;
        }

        if (scope instanceof Object) { // scope is an object / viewmodel
            if (value in scope) { // value is a property on object / viewmodel
                if (isObservableArray(scope[value])) { // value is an observable array property
                    bindingProperties.bindingValue = scope[value];
                }
                else if (isObservableProp(scope, value)) { // value is an observable property
                    bindingProperties.bindingValue = getAtom(scope, value);
                }
                else if (typeof scope[value] === 'function') { // value is a method on scope
                    bindingProperties.bindingValue = scope[value];
                }
            }
            else { // try parse the value as a string
                const regex: RegExp = /(\w+)\s*\?\s*\'([\w\s:!+=]+)'\s*:\s*'([\w\s:!+=]+)'/gm; // regex for ternary operator 
                if(value.match(regex)) {
                    let parts: RegExpExecArray = regex.exec(value)!;
                    let propertyName: string = parts[1];

                    if(propertyName in scope) {
                        let bindingValue: IComputedValue<string> = computed((): string => {
                            if(scope[propertyName]) {
                                return parts[2];
                            }
                            else {
                                return parts[3];
                            }
                        });

                        bindingProperties.propertyName = propertyName;
                        bindingProperties.bindingValue = bindingValue;
                    }
                    else {
                        return null;
                    }
                }
                else {
                    return null;
                }
            }
        }
        else { // vm is a primitive, maybe a element in an array in a foreach binding
            if (value === 'this') {
                bindingProperties.bindingValue = scope;
            }
        }

        //console.log(bindingProperties);
        return bindingProperties;
    }

    bindInitPhase = (element: HTMLElement, bindingProperties: BindingProperties, vm: any): void => {
        const currentHandler: BindingHandler = BindingEngine.handlers[bindingProperties.handler];
        let contextsForElement: Map<string, BindingContext>;

        /* if no context list exists yet for this element, create it */
        if (!this.boundElements.has(element)) {
            contextsForElement = new Map<string, BindingContext>()
            this.boundElements.set(element, contextsForElement);
        }
        else {
            contextsForElement = this.boundElements.get(element)!;
        }

        /* if the context list for this element doesn't contain an entry for this binding(-type), create it and call INIT on the handler */
        let context: BindingContext;
        if (!contextsForElement.has(bindingProperties.handler)) {
            context = new BindingContext();
            context.vm = vm;
            context.propertyName = bindingProperties.propertyName;
            context.parameter = bindingProperties.parameter;

            contextsForElement.set(bindingProperties.handler, context);

            currentHandler.init?.call(this, element, this.unwrap(bindingProperties.bindingValue), context, (value: any): void => { // for event bindings this updateFunction should not be provided
                if (bindingProperties.propertyName !== 'this') {
                    context.preventCircularUpdate = true;
                    if (isObservable(bindingProperties.bindingValue)) {
                        bindingProperties.bindingValue.set(value);
                    }
                    else {
                        bindingProperties.bindingValue = value;
                    }
                }
            });
        }
    }

    bindUpdatePhase = (element: HTMLElement, bindingProperties: BindingProperties, vm: any): void => {
        const currentHandler: BindingHandler = BindingEngine.handlers[bindingProperties.handler];
        const contextsForElement: Map<string, BindingContext> = this.boundElements.get(element)!;
        let context: BindingContext = contextsForElement.get(bindingProperties.handler)!;

        if(!currentHandler.update) { // this binding has no updater
            return;
        }

        const updateFunction = (change?: IValueDidChange<any>) => {
            let propertyValue: any = this.unwrap(bindingProperties.bindingValue);

            if (!context.preventCircularUpdate) {
                currentHandler.update!(element, propertyValue, context, change);
            }

            context.preventCircularUpdate = false;
        };

        if (isObservable(bindingProperties.bindingValue)) {
            observe(bindingProperties.bindingValue, updateFunction);
        }
            
        updateFunction();
    }

    private unwrap(property: any): any {
        if(isObservableArray(property) || !isObservable(property)) {
            return property;
        }
        else {
            return property.get();
        }
    }
}


export interface BindingProperties {
    handler: string,
    parameter: string,
    propertyName: string,
    bindingValue: any
}


BindingEngine.handlers['text'] = new TextHandler();
BindingEngine.handlers['value'] = new ValueHandler();
BindingEngine.handlers['foreach'] = new ForEachHandler();
BindingEngine.handlers['with'] = new WithHandler();
BindingEngine.handlers['html'] = new HtmlHandler();

BindingEngine.handlers['__attribute'] = new AttributeHandler();
BindingEngine.handlers['__property'] = new PropertyHandler();

BindingEngine.handlers['onclick'] = new OnClickHandler();