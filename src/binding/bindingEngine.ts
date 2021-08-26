import { isObservableProp, observe, IValueDidChange, isObservableArray, isObservable, getAtom, computed, IComputedValue, IObjectDidChange, Lambda } from 'mobx';
import { BindingHandler, TextHandler, ValueHandler, EventHandler, ForEachHandler, AttributeHandler, HtmlHandler, ContextHandler, VisibleHandler, ScopeHandler, IfHandler, TransformHandler, ContentHandler, ComponentHandler } from './bindingHandlers';
import { BindingContext } from './bindingContext';
import { PropertyHandler } from './propertyBinding';
import { bind } from '../index';

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

    parseBinding = (key: string, value: string, node: HTMLElement, vm: any): BindingProperties | null => {
        let name: string;
        let parsedValue: string;
        let operator: string = key[0];

        if (key.length === 1) {  // key is in form '@="{key: foreach, value: author.publications}"' or '#="{key: click, value: doSomething}"'
            let json: { key: string, value: string } = JSON.parse(value.replace(/'/g, "\""));
            name = json.key;
            parsedValue = json.value;
        }
        else {                  // key is in form '@foreach="author.publications"' or '#click="doSomething"'
            name = key.substr(1);
            parsedValue = value;
        }

        let bindingProperties: BindingProperties = { handler: '', parameter: '', propertyName: parsedValue, vm: vm, scope: null, bindingValue: null, element: node };

        switch (operator) {
            case '@':
                if (BindingEngine.handlers[name]) {
                    bindingProperties.handler = name;
                }
                else {
                    throw (`Unknown binding '${name}'`);
                }
                break;
            case ':':
                bindingProperties.handler = '__property';
                bindingProperties.parameter = name;
                break;
            case '_':
                bindingProperties.handler = '__attribute';
                bindingProperties.parameter = name;
                break;
            case '#':
                bindingProperties.handler = '__event';
                bindingProperties.parameter = name;
                break;
            default:
                return null;
        }

        /* Parse the passed value. THIS IS BY NO MEANS A COMPLETE PARSER, IT ONLY HANDLES SOME STRAIGHTFORWARD CASES FOR THE PROOF OF CONCEPT!
         * It can be
         * - primitive (<namespace.>propertyName or 'this'). I.e. person, person.firstName, this, someNamedScope.this, someNamedScope.getNames
         * - a ternary conditional (<namespace.>propertyName ? '<string>' : '<string>'). I.e. person.isRetired ? 'retired' : 'still working'
         * - negation (!<namespace.>propertyName). I.e. !person.isRetired, !showMenu
         * - equality comparison (<namespace>.propertyName == 'some string' or <namespace>.propertyName == <number>)
         * - string concatenation (<namespace.>propertyName + '<string>' + ...) I.e. 'https://url.com/' + person.personalPage. TODO: better to use template literals
         * - transforms (<namespace.>transform(<namespace.>propertyName)) I.e. stringToDate(article.createdAt)
         */
        const primitiveRegEx: RegExp = /^[\w.]+$/gm;
        const ternaryRegEx: RegExp = /^([\w.]+)\s*\?\s*'([\w\s:\-?!+\/#=]+)'\s*:\s*'([\w\s:\-?!+\/#=]+)'\s*$/gm;
        const compStringRegEx: RegExp = /^([\w.]+)\s*==\s*'([\w\s:\-?!+\/#=]+)'\s*$/gm;
        const compNumberRegEx: RegExp = /^([\w.]+)\s*==\s*([0-9]+)\s*$/gm;
        const transformRegEx: RegExp = /^(\S+)\((\S+)\)$/gm

        /* TODO: use dependency injection for the different parsers below? */

        if (parsedValue.match(primitiveRegEx)) { // primitive
            let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, parsedValue, operator + name, parsedValue, node) || {};
            bindingProperties.propertyName = propertyName || bindingProperties.propertyName;
            bindingProperties.scope = scope;

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
                if (parsedValue.indexOf('.') < 0) { // treat as string.. only used for scope-binding.. find a cleaner solution than to mix string syntax with parameter syntax
                    bindingProperties.bindingValue = parsedValue;
                    bindingProperties.scope = vm;
                }
                else {
                    return null; // wasn't able to parse binding, so stop. maybe dependencyTree will pick it up later
                }
            }
        }
        else if (parsedValue.match(ternaryRegEx)) { // ternary conditional
            let parts: RegExpExecArray = ternaryRegEx.exec(parsedValue)!;
            let conditional: string = parts[1];
            let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, conditional, operator + name, parsedValue, node) || {};
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
                bindingProperties.scope = scope;
            }
            else {
                return null;
            }
        }
        else if (parsedValue.match(compNumberRegEx) || parsedValue.match(compStringRegEx)) { // comparison conditional
            let parts: RegExpExecArray = parsedValue.match(compStringRegEx) ? compStringRegEx.exec(parsedValue)! : compNumberRegEx.exec(parsedValue)!;
            let conditional: string = parts[1];
            let condition: string | number = parsedValue.match(compStringRegEx) ? parts[2] : parseInt(parts[2]);
            let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, conditional, operator + name, parsedValue, node) || {};
            if (propertyName === undefined) return null; // wasn't able to parse binding, so stop. maybe dependencyTree will pick it up later

            if (propertyName in scope) {
                let bindingValue: IComputedValue<boolean> = computed((): boolean => scope[<string>propertyName] === condition);

                bindingProperties.propertyName = propertyName;
                bindingProperties.bindingValue = bindingValue;
                bindingProperties.scope = scope;
            }
            else {
                return null;
            }
        }
        else if (parsedValue.match(transformRegEx)) { // transformed binding
            let parts: RegExpExecArray = transformRegEx.exec(parsedValue)!;
            let transform: string = parts[1];
            let binding: string = parts[2];

            /* register the transform */
            let parsedAttribute = this.parseBinding('@transform', transform, node, vm);

            if(parsedAttribute === null || typeof parsedAttribute.bindingValue === 'string') { // also check for string binding (this comes from line 107 -- special SCOPE handling).. very ugly, should be replaced
                console.warn(`[Imagine] couldn\'t find transform \'${transform}\'`);
            }
            else {
                /* if the handler starts with __ it's a handler that requires extra info. e.g. __attribute or __property
                            * so register the transform to the complete path (e.g. attribute.style or property.maxCharacters)
                            * if it is a regular handler, just register the transform to the handler. (e.g. text or value)
                            */
                parsedAttribute.parameter = bindingProperties.handler.startsWith('__') 
                ? bindingProperties.handler.substr(2) + '.' + name
                : name;

                this.bindInitPhase(parsedAttribute);
            }
            
            /* register the regular binding */
            let parsedAttributeForBinding = this.parseBinding(key, binding, node, vm);
            if(parsedAttributeForBinding === null) {
                return null;
            }
            this.bindInitPhase(parsedAttributeForBinding);
            this.bindUpdatePhase(parsedAttributeForBinding);

            return null;
        }
        else if (parsedValue[0] == '!') { // simplified negation
            let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, parsedValue.substr(1), operator + name, parsedValue, node) || {};
            if (propertyName === undefined) return null; // wasn't able to parse binding, so stop. maybe dependencyTree will pick it up later

            let bindingValue: IComputedValue<boolean> = computed((): boolean => !scope[<string>propertyName]);

            bindingProperties.propertyName = propertyName;
            bindingProperties.bindingValue = bindingValue;
            bindingProperties.scope = scope;
        }
        else if (parsedValue.indexOf('+') > 0) { // simple concatenation
            let elements: string[] = parsedValue.split('+');
            elements = elements.map(item => item.trim());
            let stringRegex: RegExp = /^'([\w#/\s()]+)'$/gm;

            let allBindingsParsed = true;
            for (let i = 0; i < elements.length; i++) {
                if (!elements[i].match(stringRegex)) {
                    let { propertyName } = this.resolveScopeAndCreateDependencyTree(vm, elements[i], operator + name, parsedValue, node) || {};
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
                        let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, elements[i], operator + name, parsedValue, node)!;

                        if (propertyName in scope) {
                            concatenatedString += scope[propertyName];
                        }
                    }
                }

                return concatenatedString;
            });

            bindingProperties.propertyName = parsedValue.substr(1);
            bindingProperties.bindingValue = bindingValue;
        }


        /* event-bindings should be run in their original scope. even if the binding comes from a different scope.
         * for instance a foreach loop containing a click binding to app.clickHandler should (upon click) execute clickHandler
         * FROM the app-scope, but execute it IN the foreach scope.
         * Not at all pleased with this exception to the rule. TODO: Make this a general case
         */
        if (bindingProperties.handler == '__event') {
            bindingProperties.scope = vm;
        }

        //console.log(bindingProperties);
        return bindingProperties;
    }

    private resolveScopeAndCreateDependencyTree(scope: any, namespace: string, originalName: string, originalValue: string, originalElement: HTMLElement): { propertyName: string, scope: any } | null {
        let dependencyTree: { vm: any, property: string }[] = [];
        let finalScope: { propertyName: string, scope: any } | null = this.recursiveResolveScope(scope, namespace, dependencyTree);

        /* build the dependency tree */
        if (dependencyTree.length > 0) {
            let disposers: Lambda[] = []; /* will the array of disposers be disposed itself? */
            let storedChildElements: DocumentFragment = document.createDocumentFragment();  /* remove and store all child elements if the binding failed. If retrying, we add them back in, but for now just assume this whole tree to be corrupted */

            if (finalScope == null && originalElement.childNodes.length > 0) { /* binding failed. save and remove the childelements */
                while (originalElement.childNodes.length > 0) {
                    storedChildElements.appendChild(originalElement.childNodes[0]);
                }
            }

            for (let treeNode of dependencyTree) {
                let disposer: Lambda = observe(treeNode.vm, treeNode.property, (): void => {
                    /* somewhere in the observed path a node is changed
                     * dispose of all listeners and (try to) rebind the whole path to it's original binding
                     */
                    for (let dispose of disposers) {
                        dispose();
                    }

                    /* restore the original DOM structure and try to bind again */
                    while (storedChildElements.childNodes.length > 0) {
                        const nodeToRestore = storedChildElements.childNodes[0];

                        originalElement.appendChild(nodeToRestore);
                        /* these restored, fresh elements are plain html without any prior bindings, so they must be bound (not re-bound) */
                        bind(<HTMLElement>nodeToRestore, scope);
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
                    throw (`[Imagine] undefined scope: ${levels[0]}`);
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
                    throw (`[Imagine] undefined scope: ${levels[0]}`);
                }

                return this.recursiveResolveScope(scope, levels.slice(1).join('.'), dependencyTree);
        }
    }

    private rebind(originalName: string, originalValue: string, originalVM: any, originalElement: HTMLElement): void {
        let newBindingProperties = this.parseBinding(originalName, originalValue, originalElement, originalVM);
        let oldBindingContextTemplate: any;

        if (newBindingProperties) {
            /* clean up existing context */
            if (this.boundElements.has(originalElement)) {
                let contextsForElement: Map<string, BindingContext> = this.boundElements.get(originalElement)!;
                let contextIdentifier: string = `${newBindingProperties.handler}${newBindingProperties.parameter ? ':' + newBindingProperties.parameter : ''}`;

                if (contextsForElement.has(contextIdentifier)) {
                    oldBindingContextTemplate = contextsForElement.get(contextIdentifier)?.template; // Save a template if there was one... For if and foreach bindings that loose their template otherwise...
                    contextsForElement.delete(contextIdentifier);
                }
            }

            /* rebind init phase */
            this.bindInitPhase(newBindingProperties, true);

            /* restore template if there was one before */
            if (this.boundElements.has(originalElement) && oldBindingContextTemplate !== undefined) {
                let contextsForElement: Map<string, BindingContext> = this.boundElements.get(originalElement)!;
                let contextIdentifier: string = `${newBindingProperties.handler}${newBindingProperties.parameter ? ':' + newBindingProperties.parameter : ''}`;

                if (contextsForElement.has(contextIdentifier)) {
                    contextsForElement.get(contextIdentifier)!.template = oldBindingContextTemplate;
                }
            }

            /* rebind update phase */
            this.bindUpdatePhase(newBindingProperties);
        }
    }

    bindInitPhase = (bindingProperties: BindingProperties, rebind: boolean = false): void => {
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
            context.vm = bindingProperties.scope;
            context.originalVm = bindingProperties.vm;
            context.propertyName = bindingProperties.propertyName;
            context.parameter = bindingProperties.parameter;

            contextsForElement.set(contextIdentifier, context);

            currentHandler.init?.call(this, bindingProperties.element, this.unwrap(bindingProperties.bindingValue), context, (value: any): void => { // for event bindings this updateFunction should not be provided
                if (bindingProperties.propertyName !== 'this') {
                    context.preventCircularUpdate = true;
                    if (isObservableArray(bindingProperties.bindingValue)) {
                        bindingProperties.scope[bindingProperties.propertyName] = value;
                    }
                    else if (isObservable(bindingProperties.bindingValue)) {
                        bindingProperties.bindingValue.set(value);
                    }
                    else {
                        bindingProperties.bindingValue = value;
                    }
                }
            });
        }
    }

    bindUpdatePhase = (bindingProperties: BindingProperties): void => {
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
                    bindingProperties.bindingValue = change.newValue;
                    observe(bindingProperties.bindingValue, updateFunction); /* observe the content of the new array */
                    updateFunction(change);
                });
            }

            observe(bindingProperties.bindingValue, updateFunction); /* primitives, objects and content of arrays */
        }

        updateFunction();
    }

    getTransformFor = (element: HTMLElement, target: string): Function | { read: Function, write: Function } | null => {
        let id: string = 'transform:' + target;

        if (this.boundElements.has(element) && this.boundElements.get(element)!.has(id)) {
            return this.boundElements.get(element)!.get(id)!.vm[this.boundElements.get(element)!.get(id)!.propertyName];
        }
        else if (element.parentElement !== null) {
            return this.getTransformFor(element.parentElement, target);
        }
        // else if(element.parentNode instanceof DocumentFragment) {
        //     console.dir('SHADOW')
        //     return null;
        //     //return this.getTransformFor((<any>element.getRootNode()).host, target);
        // }

        return null;
    }

    private unwrap(property: any): any {
        /* for some reason any object with observable properties will pass the isObservable check
         * and is in that regard indistinguishable from ObservableValues
         * so check for the existence of .get on objects (yes, it could be that there is an unrelated function called get on the object -> we need a better checking mechanism)
         */

        if (isObservableArray(property) || !isObservable(property) || (typeof property === 'object' && typeof property.get !== 'function')) {
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
    scope: any,
    vm: any,
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
BindingEngine.handlers['content'] = new ContentHandler();
BindingEngine.handlers['component'] = new ComponentHandler();

BindingEngine.handlers['transform'] = new TransformHandler();

BindingEngine.handlers['__attribute'] = new AttributeHandler();
BindingEngine.handlers['__property'] = new PropertyHandler();
BindingEngine.handlers['__event'] = new EventHandler();