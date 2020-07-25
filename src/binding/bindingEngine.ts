import { isObservableProp, observe, IValueDidChange, isObservableArray, isObservable, getAtom, computed, IComputedValue, observable, IObjectDidChange } from 'mobx';
import { BindingHandler, TextHandler, ValueHandler, EventHandler, ForEachHandler, AttributeHandler, HtmlHandler, ContextHandler, VisibleHandler } from './bindingHandlers';
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
        let bindingProperties: Omit<BindingProperties, 'element'>;

        switch (name[0]) {
            case '@':
                if(BindingEngine.handlers[name.substr(1)]) {
                    bindingProperties = { handler: name.substr(1), parameter: '', propertyName: value, bindingValue: null }
                }
                else {
                    throw(`Unknown binding '${name.substr(1)}'`);
                }
                break;
            case ':':
                bindingProperties = { handler: '__property', parameter: name.substr(1), propertyName: value, bindingValue: null }
                break;
            case '_':
                bindingProperties = { handler: '__attribute', parameter: name.substr(1), propertyName: value, bindingValue: null }
                break;
            case '#':
                bindingProperties = { handler: '__event', parameter: name.substr(1), propertyName: value, bindingValue: null }
                break;
            default:
                return null;
        }

        /* Parse the passed value. It can be
         * - primitive (<namespace.>propertyName or 'this'). I.e. person, person.firstName, this, someNamedScope.this, someNamedScope.getNames
         * - a ternary conditional (<namespace.>propertyName ? '<string>' : '<string>'). I.e. person.isRetired ? 'retired' : 'still working'
         * - negation (!<namespace.>propertyName). I.e. !person.isRetired, !showMenu
         * - concatenation (<namespace.>propertyName + '<string>' + ...) I.e. 'https://url.com/' + person.personalPage, better to use template literals
         */
        let primitiveRegEx: RegExp = /^[\w.]+$/gm;
        let ternaryRegEx: RegExp = /(\w+)\s*\?\s*\'([\w\s:!+=]+)'\s*:\s*'([\w\s:!+=]+)'/gm;

        if (value.match(primitiveRegEx)) { // primitive
            let { propertyName, scope } = this.recursiveResolveScope(vm, value);

            if (propertyName === 'this') {
                bindingProperties.bindingValue = scope;
            }
            else if (scope instanceof Object) { // scope is an object / viewmodel
                if (propertyName in scope) { // value is a property on object / viewmodel
                    if (isObservableArray(scope[propertyName])) { // value is an observable array property
                        bindingProperties.bindingValue = scope[propertyName];
                    }
                    else if (isObservableProp(scope, propertyName)) { // value is an observable property
                        bindingProperties.bindingValue = getAtom(scope, propertyName);
                    }
                    else if (typeof scope[propertyName] === 'function') { // value is a method on scope
                        bindingProperties.bindingValue = scope[propertyName];
                    }
                }
            }
        }
        else if (value.match(ternaryRegEx)) { // ternary conditional
            let parts: RegExpExecArray = ternaryRegEx.exec(value)!;
            let conditional: string = parts[1];
            let { propertyName, scope } = this.recursiveResolveScope(vm, conditional);

            /* in theory, you could use 'this' here if you're in a foreach iterating over an array of observable booleans
             * but I'm not going down that rabbit hole
             */

            if (propertyName in scope) {
                let bindingValue: IComputedValue<string> = computed((): string => {
                    if (scope[propertyName]) {
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
        else if (value[0] == '!') { // simplified negation
            let { propertyName, scope } = this.recursiveResolveScope(vm, value.substr(1));
            let bindingValue: IComputedValue<boolean> = computed((): boolean => !scope[propertyName]);

            bindingProperties.propertyName = propertyName;
            bindingProperties.bindingValue = bindingValue;
        }
        else if (value.indexOf('+') > 0) { // simple concatenation
            let elements: string[] = value.split('+');
            elements = elements.map(item => item.trim());

            let bindingValue: IComputedValue<string> = computed((): string => {
                let concatenatedString: string = '';
                let stringRegex: RegExp = /^'([\w#/]+)'$/gm;

                for (let i = 0; i < elements.length; i++) {
                    if (elements[i].match(stringRegex)) {
                        concatenatedString += stringRegex.exec(elements[i])![1];
                    }
                    else {
                        let { propertyName, scope } = this.recursiveResolveScope(vm, elements[i]);

                        if (propertyName in scope) {
                            concatenatedString += scope[propertyName];
                        }
                    }
                }

                return concatenatedString;
            });

            bindingProperties.propertyName = value.substr(1);
            bindingProperties.bindingValue = bindingValue;
        }

        console.log(bindingProperties);
        return <BindingProperties>bindingProperties; // to satisfy the typing system. it still misses the property 'element'. be sure to add that.
    }

    private recursiveResolveScope(currentScope: any, namespace: string): { propertyName: string, scope: any } {
        let levels: string[] = namespace.split('.');
        let scope: any = currentScope;

        switch (levels.length) {
            case 1: // current level, no namespace
                if (levels[0] === 'this' || levels[0] in currentScope) {
                    console.log('RESOLVED NAMESPACE', { propertyName: levels[0], scope: scope })
                    return { propertyName: levels[0], scope: scope };
                }
                throw (`Undefined property: ${levels[0]}`);
            case 2: // one level of namespacing
                if (this.scopes.has(levels[0])) {
                    scope = this.scopes.get(levels[0]);
                }
                else if (levels[0] in currentScope) {
                    scope = currentScope[levels[0]];
                }
                else {
                    throw (`Undefined scope: ${levels[0]}`);
                }

                if (levels[1] in scope) {
                    console.log('RESOLVED NAMESPACE', { propertyName: levels[1], scope: scope })
                    return { propertyName: levels[1], scope: scope };
                }
                throw (`Undefined property: ${levels[1]}`);
            default: // more levels, parse the lowest and go into recursion
                if (this.scopes.has(levels[0])) {
                    scope = this.scopes.get(levels[0]);
                }
                else if (levels[0] in currentScope) {
                    scope = currentScope[levels[0]];
                }
                else {
                    throw (`Undefined scope: ${levels[0]}`);
                }

                return this.recursiveResolveScope(scope, levels.slice(1).join('.'));
        }
    }

    private rebind(bindingProperties: BindingProperties): void {
        /* cleanup exisiting binding context */

    }

    bindInitPhase = (bindingProperties: BindingProperties, vm: any): void => {
        const currentHandler: BindingHandler = BindingEngine.handlers[bindingProperties.handler];
        let contextsForElement: Map<string, BindingContext>;

        /* if no context list exists yet for this element, create it */
        if (!this.boundElements.has(bindingProperties.element)) {
            contextsForElement = new Map<string, BindingContext>()
            this.boundElements.set(bindingProperties.element, contextsForElement);
        }
        else {
            contextsForElement = this.boundElements.get(bindingProperties.element)!;
        }

        /* if the context list for this element doesn't contain an entry for this binding(-type), create it and call INIT on the handler */
        let context: BindingContext;
        let contextIdentifier: string = `${bindingProperties.handler}${bindingProperties.parameter ? ':' + bindingProperties.parameter : ''}`; /* use a Symbol? Don't really see the need */

        if (!contextsForElement.has(contextIdentifier)) {
            context = new BindingContext();
            context.vm = vm;
            context.propertyName = bindingProperties.propertyName;
            context.parameter = bindingProperties.parameter;

            contextsForElement.set(contextIdentifier, context);

            currentHandler.init?.call(this, bindingProperties.element, this.unwrap(bindingProperties.bindingValue), context, (value: any): void => { // for event bindings this updateFunction should not be provided
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

    bindUpdatePhase = (bindingProperties: BindingProperties, vm: any): void => {
        const currentHandler: BindingHandler = BindingEngine.handlers[bindingProperties.handler];
        const contextsForElement: Map<string, BindingContext> = this.boundElements.get(bindingProperties.element)!;
        let contextIdentifier: string = `${bindingProperties.handler}${bindingProperties.parameter ? ':' + bindingProperties.parameter : ''}`;
        let context: BindingContext = contextsForElement.get(contextIdentifier)!;

        if (!currentHandler.update) { // this binding has no updater
            return;
        }

        const updateFunction = (change?: IValueDidChange<any> | IObjectDidChange) => {
            let propertyValue: any = this.unwrap(bindingProperties.bindingValue);

            if (!context.preventCircularUpdate) {
                currentHandler.update!(bindingProperties.element, propertyValue, context, change);
            }

            context.preventCircularUpdate = false;
        };

        if (isObservable(bindingProperties.bindingValue)) {
            if (isObservableArray(bindingProperties.bindingValue)) { /* not only observe the array contents, but also replacing the array */
                observe(context.vm, bindingProperties.propertyName, (change: IValueDidChange<any>): void => {
                    updateFunction(change);
                    observe(context.vm[bindingProperties.propertyName], updateFunction); /* observe the new array */
                });
            }

            observe(bindingProperties.bindingValue, updateFunction); /* primitives, objects and content of arrays */
        }

        updateFunction();
    }

    private unwrap(property: any): any {
        if (isObservableArray(property) || !isObservable(property)) {
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
    bindingValue: any,
    element: HTMLElement
}


BindingEngine.handlers['text'] = new TextHandler();
BindingEngine.handlers['value'] = new ValueHandler();
BindingEngine.handlers['foreach'] = new ForEachHandler();
BindingEngine.handlers['context'] = new ContextHandler();
BindingEngine.handlers['html'] = new HtmlHandler();
BindingEngine.handlers['visible'] = new VisibleHandler();

BindingEngine.handlers['__attribute'] = new AttributeHandler();
BindingEngine.handlers['__property'] = new PropertyHandler();
BindingEngine.handlers['__event'] = new EventHandler();