import { isObservableProp, observe, IValueDidChange, isObservableArray, isObservable, getAtom, computed, IComputedValue, IObjectDidChange, Lambda } from 'mobx';
import { BindingHandler, TextHandler, ValueHandler, EventHandler, ForEachHandler, AttributeHandler, HtmlHandler, ContextHandler, VisibleHandler, ScopeHandler, IfHandler } from './bindingHandlers';
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

    parseBinding = (name: string, value: string, node: HTMLElement, vm: any): BindingProperties | null => {
        let bindingProperties: BindingProperties = { handler: '', parameter: '', propertyName: value, bindingValue: null, element: node };

        switch (name[0]) {
            case '@':
                if (BindingEngine.handlers[name.substr(1)]) {
                    bindingProperties. handler = name.substr(1);
                }
                else {
                    throw (`Unknown binding '${name.substr(1)}'`);
                }
                break;
            case ':':
                bindingProperties.handler = '__property';
                bindingProperties.parameter = name.substr(1);
                break;
            case '_':
                bindingProperties.handler = '__attribute';
                bindingProperties.parameter = name.substr(1);
                break;
            case '#':
                bindingProperties.handler = '__event';
                bindingProperties.parameter = name.substr(1);
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
        let ternaryRegEx: RegExp = /(\w+)\s*\?\s*\'([\w\s:\-!+=]+)'\s*:\s*'([\w\s:\-!+=]+)'/gm;

        if (value.match(primitiveRegEx)) { // primitive
            let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, value, name, value, node) || {};
            
            if (propertyName !== undefined) {
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
                        else { // non-observable property on scope
                            bindingProperties.bindingValue = scope[propertyName];
                        }
                    }
                }
            } 
            else { // probably stop, but first check for 1 special case: a string is passed in stead of a property
                if(value.indexOf('.') < 0) { // treat as string
                    bindingProperties.bindingValue = value;
                }
                else {
                    return null; // wasn't able to parse binding, so stop. maybe dependencyTree will pick it up later
                }
            }
        }
        else if (value.match(ternaryRegEx)) { // ternary conditional
            let parts: RegExpExecArray = ternaryRegEx.exec(value)!;
            let conditional: string = parts[1];
            let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, conditional, name, value, node) || {};
            console.log(conditional, propertyName, scope)
            if (propertyName === undefined) return null; // wasn't able to parse binding, so stop. maybe dependencyTree will pick it up later

            /* in theory, you could use 'this' here if you're in a foreach iterating over an array of observable booleans
             * but I'm not going down that rabbit hole
             */

            if (propertyName in scope) {
                let bindingValue: IComputedValue<string> = computed((): string => {
                    if (scope[<string>propertyName]) {
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
            let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, value.substr(1), name, value, node) || {};
            if (propertyName === undefined) return null; // wasn't able to parse binding, so stop. maybe dependencyTree will pick it up later

            let bindingValue: IComputedValue<boolean> = computed((): boolean => !scope[<string>propertyName]);

            bindingProperties.propertyName = propertyName;
            bindingProperties.bindingValue = bindingValue;
        }
        else if (value.indexOf('+') > 0) { // simple concatenation
            let elements: string[] = value.split('+');
            elements = elements.map(item => item.trim());
            let stringRegex: RegExp = /^'([\w#/]+)'$/gm;

            let allBindingsParsed = true;
            for (let i = 0; i < elements.length; i++) {
                if (!elements[i].match(stringRegex)) {
                    let { propertyName } = this.resolveScopeAndCreateDependencyTree(vm, elements[i], name, value, node) || {};
                    if (propertyName === undefined) {
                        allBindingsParsed = false;
                        continue; // wasn't able to parse binding. maybe dependencyTree will pick it up later
                    }
                }
            }

            if (!allBindingsParsed) return null; // wasn't able to parse binding, so stop. maybe dependencyTree will pick it up later

            let bindingValue: IComputedValue<string> = computed((): string => {
                let concatenatedString: string = '';

                for (let i = 0; i < elements.length; i++) {
                    if (elements[i].match(stringRegex)) {
                        concatenatedString += stringRegex.exec(elements[i])![1];
                    }
                    else {
                        let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, elements[i], name, value, node)!;

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

        //console.log(bindingProperties);
        return <BindingProperties>bindingProperties; // to satisfy the typing system. it still misses the property 'element'. be sure to add that.
    }

    private resolveScopeAndCreateDependencyTree(scope: any, namespace: string, originalName: string, originalValue: string, originalElement: HTMLElement): { propertyName: string, scope: any } | null {
        let dependencyTree: { vm: any, property: string }[] = [];
        let finalScope: { propertyName: string, scope: any } | null = this.recursiveResolveScope(scope, namespace, dependencyTree);

        /* build the dependency tree */
        if (dependencyTree.length > 0) {
            let disposers: Lambda[] = []; /* will the array of disposers be disposed itself? */

            for(let treeNode of dependencyTree) {
                let disposer: Lambda = observe(treeNode.vm, treeNode.property, (): void => {
                    /* somewhere in the observed path a node is changed
                     * dispose of all listeners and (try to) rebind the whole path to it's original binding
                     */
                     for(let dispose of disposers) {
                         dispose();
                     }

                     this.rebind(originalName, originalValue, scope, originalElement);
                });

                disposers.push(disposer);
            }
        }

        return finalScope;
    }

    private recursiveResolveScope(currentScope: any, namespace: string, dependencyTree: { vm: any, property: string }[]): { propertyName: string, scope: any } | null {
        let levels: string[] = namespace.split('.');
        let scope: any = currentScope;

        switch (levels.length) {
            case 1: // current level, no namespace
                if (levels[0] === 'this' || levels[0] in currentScope) {
                    return { propertyName: levels[0], scope: scope };
                }
                return null; // wasn't able to parse binding, but don't throw yet: maybe it's a string binding
            case 2: // one level of namespacing
                if (this.scopes.has(levels[0])) {
                    scope = this.scopes.get(levels[0]);
                }
                else if (levels[0] in currentScope) {
                    dependencyTree.push({ vm: currentScope, property: levels[0] });
                    scope = currentScope[levels[0]];
                }
                else {
                    throw (`Undefined scope: ${levels[0]}`);
                }

                if (scope && levels[1] in scope) {
                    return { propertyName: levels[1], scope: scope };
                }
            
                return null; // wasn't able to parse binding, but don't throw yet: maybe the dependencyTree will get it to work in a future update of the viewmodel...
            default: // more levels, parse the lowest and go into recursion
                if (this.scopes.has(levels[0])) {
                    scope = this.scopes.get(levels[0]);
                }
                else if (levels[0] in currentScope) {
                    dependencyTree.push({ vm: currentScope, property: levels[0] });
                    scope = currentScope[levels[0]];
                }
                else {
                    throw (`Undefined scope: ${levels[0]}`);
                }

                return this.recursiveResolveScope(scope, levels.slice(1).join('.'), dependencyTree);
        }
    }

    private rebind(originalName: string, originalValue: string, originalVM: any, originalElement: HTMLElement): void {
        let newBindingProperties = this.parseBinding(originalName, originalValue, originalElement, originalVM);
        
        if (newBindingProperties) {
            /* clean up existing context */
            if(this.boundElements.has(originalElement)) {
                let contextsForElement: Map<string, BindingContext> = this.boundElements.get(originalElement)!;
                let contextIdentifier: string = `${newBindingProperties.handler}${newBindingProperties.parameter ? ':' + newBindingProperties.parameter : ''}`;

                if(contextsForElement.has(contextIdentifier)) {
                    console.log('EXISTING CONTEXT FOUND', contextsForElement.get(contextIdentifier));
                    contextsForElement.delete(contextIdentifier);
                }
            } 

            /* rebind */
            this.bindInitPhase(newBindingProperties, originalVM, true);
            this.bindUpdatePhase(newBindingProperties, originalVM);
        }
    }

    bindInitPhase = (bindingProperties: BindingProperties, vm: any, rebind: boolean = false): void => {
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

        if (!contextsForElement.has(contextIdentifier) || rebind) {
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
BindingEngine.handlers['if'] = new IfHandler();
BindingEngine.handlers['scope'] = new ScopeHandler();
BindingEngine.handlers['html'] = new HtmlHandler();
BindingEngine.handlers['visible'] = new VisibleHandler();

BindingEngine.handlers['__attribute'] = new AttributeHandler();
BindingEngine.handlers['__property'] = new PropertyHandler();
BindingEngine.handlers['__event'] = new EventHandler();