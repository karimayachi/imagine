import { isObservableProp, autorun, observe, IValueDidChange, isObservableArray } from 'mobx';
import { BindingHandler, TextHandler, ValueHandler, OnClickHandler, ForEachHandler, AttributeHandler } from './bindingHandlers';
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

    bind = (handlerName: string, parameter: string, element: HTMLElement, vm: any, propertyName: string): void => {
        let preventCircularUpdate = false;
        const currentHandler: BindingHandler = BindingEngine.handlers[handlerName];

        let contextsForElement: Map<string, BindingContext>;

        /* if no context list exists yet for this element, create it */
        if (!this.boundElements.has(element)) {
            contextsForElement = new Map<string, BindingContext>()
            this.boundElements.set(element, contextsForElement);
        }
        else {
            contextsForElement = this.boundElements.get(element)!;
        }

        let scope: any = vm;

        if(propertyName.indexOf('.') > -1) {
            let scopeName: string = propertyName.split('.')[0];
            propertyName = propertyName.split('.')[1];

            if(!this.scopes.has(scopeName)) {
                throw(`Undefined scope: ${scopeName}`);
            }
            else {
                scope = this.scopes.get(scopeName);
            }
        }

        let propertyValue: any = propertyName === 'this' ? scope : scope[propertyName];

        /* if the context list for this element doesn't contain an entry for this binding(-type), create it and call INIT on the handler */
        let context: BindingContext;
        if (!contextsForElement.has(handlerName)) {
            context = new BindingContext();
            context.vm = vm;
            context.propertyName = propertyName;
            context.parameter = parameter;

            contextsForElement.set(handlerName, context);

            currentHandler.init?.call(this, element, propertyValue, context, (value: any): void => { // for event bindings this updateFunction should not be provided
                if (propertyName !== 'this') {
                    preventCircularUpdate = true;
                    scope[propertyName] = value;
                }
            });
        }
        else {
            context = contextsForElement.get(handlerName)!;
        }

        if (isObservableProp(scope, propertyName) && currentHandler.update) {
            const updateFunction = (change?: IValueDidChange<any>) => {
                if (!preventCircularUpdate) {
                    currentHandler.update!(element, scope[propertyName], context, change);
                }

                preventCircularUpdate = false;
            };

            if (isObservableArray(vm[propertyName])) {
                observe(scope[propertyName], updateFunction);
            }
            else {
                observe(scope, propertyName, updateFunction);
            }
            
            updateFunction();
        }
        else if (currentHandler.update) {
            currentHandler.update(element, propertyValue, context);
        }
    }
}

BindingEngine.handlers['text'] = new TextHandler();
BindingEngine.handlers['value'] = new ValueHandler();
BindingEngine.handlers['foreach'] = new ForEachHandler();

BindingEngine.handlers['__attribute'] = new AttributeHandler();
BindingEngine.handlers['__property'] = new PropertyHandler();

BindingEngine.handlers['onclick'] = new OnClickHandler();