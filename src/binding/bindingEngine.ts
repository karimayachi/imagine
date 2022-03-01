import { isObservableProp, observe, IValueDidChange, isObservableArray, isObservable, getAtom, computed, IComputedValue, IObjectDidChange, Lambda, toJS, isComputed } from 'mobx';
import { BindingHandler, TextHandler, ValueHandler, EventHandler, ForEachHandler, AttributeHandler, HtmlHandler, ContextHandler, VisibleHandler, ScopeHandler, IfHandler, ContentHandler, ComponentHandler } from './bindingHandlers';
import { BindingContext } from './bindingContext';
import { PropertyHandler } from './propertyBinding';
import { bindWithParent } from '../index';

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

    parseBinding = (key: string, value: string, node: HTMLElement, vm: any, parentVm: any): BindingProperties | null | undefined => {
        let name: string;
        let parsedValue: string;
        let operator: string = key[0];

        if (key === '@' || key === '#' || key === '_' || key === ':') {  // key is in form '@="{key: foreach, value: author.publications}"' or '#="{key: click, value: doSomething}"'
            let json: { key: string, value: string } = JSON.parse(value.replace(/'/g, "\""));
            name = json.key;
            parsedValue = json.value;
        }
        else if (key.substr(0, 5) === 'data-') { // key is in form 'data-text="author.publications"' or 'data-value="someValue"' (only works with build in bindings for now)
            name = key.substr(5);
            operator = '@';
            parsedValue = value;
        }
        else {                  // key is in form '@foreach="author.publications"' or '#click="doSomething"'
            name = key.substr(1);
            parsedValue = value;
        }

        let bindingProperties: BindingProperties = { handler: '', parameter: '', propertyName: parsedValue, vm: vm, scope: null, bindingValue: null, element: node, isCacheable: false };

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
                /* At this point the whole attribute couldn't be recognized. Return undefined to mean that we should 
                 * ignore this attribute (it is not an Imagine attribute). If we get passed this point and fail to 
                 * parse the value, we must return null in stead. This means: it is an Imagine attribute, but we couldn't
                 * resolve it. Maybe later it will succeed to parse.
                 */
                return undefined;
        }

        /* Parse the passed value. THIS IS BY NO MEANS A COMPLETE PARSER, IT ONLY HANDLES SOME STRAIGHTFORWARD CASES AS A PROOF OF CONCEPT!
         * It can be
         * - primitive (<namespace.>propertyName or 'this'). I.e. person, person.firstName, this, someNamedScope.this, someNamedScope.getNames
         * - a ternary conditional (<namespace.>propertyName ? '<string>' : '<string>'). I.e. person.isRetired ? 'retired' : 'still working'
         * - negation (!<namespace.>propertyName). I.e. !person.isRetired, !showMenu
         * - equality comparison (<namespace>.propertyName == 'some string' or <namespace>.propertyName == <number>)
         * - string concatenation (<namespace.>propertyName + '<string>' + ...) I.e. 'https://url.com/' + person.personalPage. TODO: better to use template literals
         * - transforms (<namespace.>transform(<namespace.>propertyName)) I.e. stringToDate(article.createdAt)
         */
        const primitiveRegEx: RegExp = /^[\w.']+$/gm;
        const ternaryRegEx: RegExp = /^([\w.]+)\s*\?\s*'([\w\s:\-?!+\/#=]+)'\s*:\s*'([\w\s:\-?!+\/#=]+)'\s*$/gm;
        const compStringRegEx: RegExp = /^([\w.]+)\s*(==|!=)\s*'([\w\s:\-?!+\/#=]*)'\s*$/gm;
        const compNumberRegEx: RegExp = /^([\w.]+)\s*(==|!=)\s*([0-9]+)\s*$/gm;
        const transformRegEx: RegExp = /^(\S+)\((\S+)\)$/gm

        /* TODO: use dependency injection for the different parsers below?
         * PLUS: Too many levels of 'if-else'.. refactor!!
         */
        if (parsedValue.match(primitiveRegEx)) { // primitive
            let { propertyName, scope, isAbsoluteScope } = this.resolveScopeAndCreateDependencyTree(vm, parentVm, parsedValue, operator + name, parsedValue, node) || {};
            bindingProperties.propertyName = propertyName || bindingProperties.propertyName;
            bindingProperties.scope = scope;

            bindingProperties.isCacheable =  isAbsoluteScope || (scope === vm); // FOR NOW ONLY PRIMITIVE BINDINGS ARE CACHEABLE -- ALSO NO DEPENDENCY TREE IS ALLOWED (vm === scope) (exception: if the dependency tree is absolute - not relative to the current viewmodel)

            if (propertyName !== undefined) {
                bindingProperties.bindingValue = this.getBindingValueFromProperty(propertyName, scope, parentVm);
            }
            else {
                return null; // wasn't able to parse binding, so stop. maybe dependencyTree will pick it up later
            }
        }
        else if (parsedValue.match(ternaryRegEx)) { // ternary conditional
            let parts: RegExpExecArray = ternaryRegEx.exec(parsedValue)!;
            let conditional: string = parts[1];
            let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, parentVm, conditional, operator + name, parsedValue, node) || {};

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
            let equality: string = parts[2]; // == or !=
            let condition: string | number = parsedValue.match(compStringRegEx) ? parts[3] : parseInt(parts[3]);
            let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, parentVm, conditional, operator + name, parsedValue, node) || {};
            if (propertyName === undefined) return null; // wasn't able to parse binding, so stop. maybe dependencyTree will pick it up later

            if (propertyName in scope) {
                let bindingValue: IComputedValue<boolean> = computed((): boolean => equality === '==' ? scope[<string>propertyName] === condition : scope[<string>propertyName] !== condition);

                bindingProperties.propertyName = propertyName;
                bindingProperties.bindingValue = bindingValue;
                bindingProperties.scope = scope;
            }
            else {
                return null;
            }
        }
        else if (parsedValue.match(transformRegEx)) { // transform binding
            const parts: RegExpExecArray = transformRegEx.exec(parsedValue)!;
            const transformPart: string = parts[1];
            const bindingPart: string = parts[2];
            let transformFunction: Function | { read: Function, write: Function} | undefined;
            let binding: any;

            /* parse the transform */
            let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, parentVm, transformPart, operator + name, parsedValue, node) || {};
            if (propertyName !== undefined) {
                transformFunction = this.getBindingValueFromProperty(propertyName, scope, parentVm);
            }

            if (typeof transformFunction !== 'function' &&
                !(typeof transformFunction === 'object' && 'write' in transformFunction && 'read' in transformFunction)) {
                throw new Error(`[Imagine] couldn\'t find transform \'${transformPart}\'`);
            }

            /* parse the regular binding */
            ({ propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, parentVm, bindingPart, operator + name, parsedValue, node) || {});
            if (propertyName !== undefined) {
                binding = this.getBindingValueFromProperty(propertyName, scope, parentVm);
            }
            else {
                return null; // wasn't able to parse binding, so stop. maybe dependencyTree will pick it up later
            }

            /* construct the transformed binding */
            const bindingValue: IComputedValue<boolean> = typeof transformFunction === 'function'
                ? computed((): any => (<Function>transformFunction)(this.unwrap(binding)))
                : computed((): any => (<{read:Function}>transformFunction).read(this.unwrap(binding)),
                           (value: any): void => {
                               binding.set((<{write:Function}>transformFunction).write(value));
                           });

            bindingProperties.propertyName = propertyName;
            bindingProperties.bindingValue = bindingValue;
            bindingProperties.scope = scope;
        }
        else if (parsedValue[0] == '!') { // simplified negation
            let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, parentVm, parsedValue.substr(1), operator + name, parsedValue, node) || {};
            if (propertyName === undefined) return null; // wasn't able to parse binding, so stop. maybe dependencyTree will pick it up later

            let bindingValue: IComputedValue<boolean> = computed((): boolean => !scope[<string>propertyName]);

            bindingProperties.propertyName = propertyName;
            bindingProperties.bindingValue = bindingValue;
            bindingProperties.scope = scope;
        }
        else if (parsedValue.indexOf('+') > 0) { // simple concatenation
            let elements: string[] = parsedValue.split('+');
            elements = elements.map(item => item.trim());
            let stringRegex: RegExp = /^'([\w#/\s():]+)'$/gm;

            let allBindingsParsed = true;
            for (let i = 0; i < elements.length; i++) {
                if (!elements[i].match(stringRegex)) {
                    let { propertyName } = this.resolveScopeAndCreateDependencyTree(vm, parentVm, elements[i], operator + name, parsedValue, node) || {};
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
                        let { propertyName, scope } = this.resolveScopeAndCreateDependencyTree(vm, parentVm, elements[i], operator + name, parsedValue, node)!;

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

        return bindingProperties;
    }

    getBindingValueFromProperty(propertyName: string, viewmodel: any, parentViewmodel: any): any {
        if (/^'\w+'$/gm.test(propertyName)) { // string value ('someText')
            return propertyName.substring(1, propertyName.length - 1);
        }
        else if (propertyName === 'this') {
            return viewmodel;
        }
        else if (propertyName === 'super' && parentViewmodel) {
            return parentViewmodel;
        }
        else if (viewmodel instanceof Object && propertyName in viewmodel) { // viewmodel is an object / viewmodel and value is a property on object / viewmodel
            if (isObservableArray(viewmodel[propertyName])) { // value is an observable array property
                return viewmodel[propertyName];
            }
            if (isObservableProp(viewmodel, propertyName)) { // value is an observable property
                return getAtom(viewmodel, propertyName);
            }
            else if (typeof viewmodel[propertyName] === 'function') { // value is a method on scope
                return viewmodel[propertyName];
            }
            else { // non-observable property on scope
                return viewmodel[propertyName];
            }
        }
    }

    private resolveScopeAndCreateDependencyTree(scope: any, parentScope: any, namespace: string, originalName: string, originalValue: string, originalElement: HTMLElement): { propertyName: string, scope: any, isAbsoluteScope: boolean } | null {
        let dependencyTree: { vm: any, property: string }[] = [];
        let finalScope: { propertyName: string, scope: any, isAbsoluteScope: boolean } | null = this.recursiveResolveScope(scope, parentScope, namespace, dependencyTree);

        /* build the dependency tree */
        if (dependencyTree.length > 0) {
            const disposers: Lambda[] = []; /* will the array of disposers be disposed itself? */
            const storedChildElements: DocumentFragment = document.createDocumentFragment();  /* remove and store all child elements if the binding failed. If retrying, we add them back in, but for now just assume this whole tree to be corrupted */

            if (finalScope == null && originalElement.childNodes.length > 0) { /* binding failed. save and remove the childelements */
                while (originalElement.childNodes.length > 0) {
                    storedChildElements.appendChild(originalElement.childNodes[0]);
                }
            }

            for (let treeNode of dependencyTree) {
                const disposer: Lambda = observe(treeNode.vm, treeNode.property, (change): void => {
                    //console.log('DEPENDENCY TREE TRIGGERED FOR', treeNode, originalName);
                    /* somewhere in the observed path a node is changed
                     * dispose of all listeners and (try to) rebind the whole path to it's original binding
                     */
                    for (let dispose of disposers) {
                        dispose();
                    }

                    /* restore the original DOM structure */
                    while (storedChildElements.childNodes.length > 0) {
                        const nodeToRestore = storedChildElements.childNodes[0];
                        originalElement.appendChild(nodeToRestore);
                    }

                    const controlsChildren: boolean = this.rebind(originalName, originalValue, scope, parentScope, originalElement);

                    /* if we restored the stored child elements, we need te bind them, unless the originalelement binding
                     * controls the child elements (@if binding, etc)
                     */
                    if (!controlsChildren) {
                        for (let i = 0; i < originalElement.childNodes.length; i++) {
                            const nodeToBind: ChildNode = originalElement.childNodes[i];
                            bindWithParent(scope, parentScope, nodeToBind);
                        }
                    }
                });

                disposers.push(disposer);
            }
        }
        else if(finalScope == null) { // binding failed and there is no dependency tree.. It will probably never resolve, so just throw the children away
            originalElement.innerHTML = '';
        }

        return finalScope;
    }

    /* Named scopes and paths starting from a named scope are absolute. They are not relative to the current viewmodel.
     * This is important for templates, since bindings that are relative to the current instance of a template cannot 
     * be cached.
     */
    private recursiveResolveScope(currentScope: any, parentScope: any, namespace: string, dependencyTree: { vm: any, property: string }[]): { propertyName: string, scope: any, isAbsoluteScope: boolean } | null {
        let levels: string[] = namespace.split('.');
        let scope: any = currentScope;
        let isAbsoluteScope: boolean = false;

        switch (levels.length) {
            case 1: // current level, no namespace
                if (/^'\w+'$/gm.test(levels[0]) || // string value ('someText')
                    levels[0] === 'this' ||
                    levels[0] in currentScope) {
                    return { propertyName: levels[0], scope, isAbsoluteScope };
                }
                else if(levels[0] === 'super'){
                    return { propertyName: 'super', scope: parentScope, isAbsoluteScope };
                }

                throw (`[Imagine] cannot parse property: ${levels[0]}`);
            case 2: // one level of namespacing
                /* Check scope */
                if (this.scopes.has(levels[0])) {
                    isAbsoluteScope = true;
                    scope = this.scopes.get(levels[0]);
                }
                else if (typeof currentScope !== 'object' && typeof currentScope !== 'undefined' && currentScope !== null) {
                    throw (`[Imagine] scope: ${currentScope} is not an object, but a ${typeof currentScope}, when resolving ${namespace}`);
                }
                else if (typeof currentScope === 'undefined' || currentScope === null || Object.keys(toJS(scope)).length === 0) {
                    return null; // stop binding, but do keep the dependencyTree, maybe it will resolve later
                }
                else if (levels[0] === 'super') {
                    // dependencyTree.push({ vm: ??, property: ?? }); //no dependencies on super
                    scope = parentScope;
                }
                else if (levels[0] in currentScope) {
                    dependencyTree.push({ vm: currentScope, property: levels[0] });
                    scope = currentScope[levels[0]];
                }
                else {
                    throw (`[Imagine] undefined scope: ${levels[0]}`);
                }

                /* Check final level on scope */
                if (scope && levels[1] in scope) {
                    return { propertyName: levels[1], scope: scope, isAbsoluteScope };
                }

                return null; // final level wasn't found on scope, but don't throw: maybe the dependencyTree will get it to work in a future update of the scope/viewmodel...
            default: // more levels, parse the lowest and go into recursion
                if (this.scopes.has(levels[0])) {
                    isAbsoluteScope = true;
                    scope = this.scopes.get(levels[0]);
                }
                else if (typeof currentScope !== 'object' && typeof currentScope !== 'undefined' && currentScope !== null) {
                    throw (`[Imagine] scope: ${currentScope} is not an object, but a ${typeof currentScope}, when resolving ${namespace}`);
                }
                else if (typeof currentScope === 'undefined' || currentScope === null || Object.keys(toJS(scope)).length === 0) {
                    return null; // stop binding, but do keep the dependencyTree, maybe it will resolve later
                }
                else if (levels[0] === 'super') {
                    // dependencyTree.push({ vm: ??, property: ?? }); //no dependencies on super
                    scope = parentScope;
                }
                else if (levels[0] in currentScope) {
                    dependencyTree.push({ vm: currentScope, property: levels[0] });
                    scope = currentScope[levels[0]];
                }
                else {
                    throw (`[Imagine] undefined scope: ${levels[0]}`);
                }

                return this.recursiveResolveScope(scope, parentScope, levels.slice(1).join('.'), dependencyTree);
        }
    }

    recursiveRebindAll = (element: HTMLElement, vm: any): void => {
        let childrenAreUnderControl: boolean = false;

        if (this.boundElements.has(element)) {
            const contextsForElement: Map<string, BindingContext> = this.boundElements.get(element)!;
            const contextsToIterateOver: BindingContext[] = [];

            /* don't iterate over the Map we're altering. So first store in temp array (contextsToIterateOver) */
            contextsForElement.forEach((context: BindingContext) => {
                contextsToIterateOver.push(context);
            });

            for (let context of contextsToIterateOver) {
                if (context.originalKey && context.originalValue) { // I believe only template-context created in 'bind' don't fill this requirement, but I can't remember what that context is for in the first place
                    childrenAreUnderControl = this.rebind(context.originalKey, context.originalValue, vm, context.parentVm, element) || childrenAreUnderControl;
                }
            }
        }

        if (!childrenAreUnderControl && !element.tagName.includes('-')) { // if tagname contains '-' assume WebComponent
            for (let i = 0; i < element.children.length; i++) {
                this.recursiveRebindAll(<HTMLElement>element.children[i], vm);
            };
        }
    }

    /**
     * @returns true if child nodes were updated during rebind, false otherwise
     */
    private rebind(originalName: string, originalValue: string, originalVM: any, originalParent: any, originalElement: HTMLElement): boolean {
        let newBindingProperties: BindingProperties | null | undefined = this.parseBinding(originalName, originalValue, originalElement, originalVM, originalParent);
        let oldBindingContextTemplate: any;
        let bindingControlsChildren: boolean = false;

        if (newBindingProperties) {
            /* clean up existing context */
            if (this.boundElements.has(originalElement)) {
                let contextsForElement: Map<string, BindingContext> = this.boundElements.get(originalElement)!;
                let contextIdentifier: string = `${newBindingProperties.handler}${newBindingProperties.parameter ? ':' + newBindingProperties.parameter : ''}`;

                if (contextsForElement.has(contextIdentifier)) {
                    oldBindingContextTemplate = contextsForElement.get(contextIdentifier)?.template; // Save a template if there was one... For 'if' and 'foreach' bindings that loose their template otherwise...
                    contextsForElement.delete(contextIdentifier);
                }
            }

            /* rebind init phase */
            const newContext: BindingContext = this.bindInitPhase(newBindingProperties, true);
            newContext.originalKey = originalName;
            newContext.originalValue = originalValue;
            newContext.parentVm = originalParent;
            bindingControlsChildren = bindingControlsChildren || newContext.controlsChildren; // in case EITHER of the bindings (in case of transform) controls it's children

            /* restore template if there was one before */
            if (oldBindingContextTemplate !== undefined) {
                // setTimeout(() => { // schedule after init, but before update. Both need to have time-outs set
                    newContext.template = oldBindingContextTemplate;
                // }, 0);
            }

            /* rebind update phase */
            this.bindUpdatePhase(newBindingProperties);
        }

        return bindingControlsChildren;
    }

    /**
     * @returns the created BindingContext or an existing if Init was called on already bound element
     */
    bindInitPhase = (bindingProperties: BindingProperties, rebind: boolean = false): BindingContext => {
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

            let handlerControlsChildren = currentHandler.init?.call(this, bindingProperties.element, this.unwrap(bindingProperties.bindingValue), context, (value: any): void => { // for event bindings this updateFunction should not be provided
                if (bindingProperties.propertyName !== 'this') {
                    //console.log('------ PREVENT CIRCULAR UPDATE FOR', bindingProperties.propertyName)
                    context.preventCircularUpdateIn = true;

                    if (isObservableArray(bindingProperties.bindingValue)) {
                        if (!Array.isArray(value)) {
                            throw new Error(`Cannot pass single value to observable array '${bindingProperties.propertyName}'`);
                        }

                        bindingProperties.scope[bindingProperties.propertyName] = value;
                    }
                    else if (isObservable(bindingProperties.bindingValue)) {
                        /* if at binding time the property was not instantiated (undefined), it was assumed that it would be
                         * a normal observable property and bindingvalue was set to getAtom(scope, propertyname)
                         * if at first instantiation an array is passed, this assumption turns out to be wrong. So fix it here
                         * ONLY ALLOW THIS IF THE PROPERTY IS STILL UNDEFINED, WE DON'T WANT RANDOM OBSERVABLE TYPE SWITCHING!
                         */
                        if (bindingProperties.bindingValue.get() === undefined && Array.isArray(value)) {
                            /* Remove the current listeners on the observable, set it to the array
                             * and then rebind the update-phase as an array
                             */
                            bindingProperties.bindingValue.changeListeners = []; /* hackery to de-register our listeners, without keeping track of the disposers. Don't know if this has (memory-leak) side-effects */
                            bindingProperties.scope[bindingProperties.propertyName] = value;
                            bindingProperties.bindingValue = bindingProperties.scope[bindingProperties.propertyName];
                            this.bindUpdatePhase(bindingProperties);
                        }
                        else if (Array.isArray(value)) {
                            throw new Error(`Cannot pass array to regular observable '${bindingProperties.propertyName}'`);
                        }
                        else {
                            /* If value hasn't changed, observers will not be called by MobX.
                             * this is of course correct behaviour. However, it prevents the reset
                             * of the CircularUpdatePrevention and that gets stuck in Prevent-mode
                             * So manually reset it, if no changes are propagated
                             */
                            if(bindingProperties.bindingValue.get() === value) {
                                context.preventCircularUpdateIn = false;
                            }
                            else {
                                bindingProperties.bindingValue.set(value);
                            }
                        }
                    }
                    else {
                        bindingProperties.bindingValue = value;
                    }
                }
            });

            if (handlerControlsChildren) {
                context.controlsChildren = true;
            }

            return context;
        }

        return contextsForElement.get(contextIdentifier)!;
    }

    bindUpdatePhase = (bindingProperties: BindingProperties): void => {
        const currentHandler: BindingHandler = BindingEngine.handlers[bindingProperties.handler];
        const contextsForElement: Map<string, BindingContext> = this.boundElements.get(bindingProperties.element)!;
        let contextIdentifier: string = `${bindingProperties.handler}${bindingProperties.parameter ? ':' + bindingProperties.parameter : ''}`;
        let context: BindingContext = contextsForElement.get(contextIdentifier)!;

        if (!currentHandler.update) { // this binding has no updater
            return;
        }

        const updateFunction = (a: string, change?: IValueDidChange<any> | IObjectDidChange) => {
            if (change && 'name' in change) { // MobX's observe also fires when sub-properties are changed, but we don't want to respond to that here
                //console.log('REJECTED CHANGE', change, context.propertyName)
                return;
            }

            let propertyValue: any = this.unwrap(bindingProperties.bindingValue);

            //console.log('UPDATE PHASE START', context.preventCircularUpdateIn, change)
            if (!context.preventCircularUpdateIn) {
                context.preventCircularUpdate = true;
                currentHandler.update!(bindingProperties.element, propertyValue, context, change);
            }

            context.preventCircularUpdateIn = false;
        };

        if (isObservable(bindingProperties.bindingValue)) {
            if (isObservableArray(bindingProperties.bindingValue)) { /* not only observe the array contents, but also replacing the array */
                observe(context.vm, bindingProperties.propertyName, (change: IValueDidChange<any>): void => {
                    bindingProperties.bindingValue = change.newValue;
                    observe(bindingProperties.bindingValue, (c) => { updateFunction('from array ' + bindingProperties.propertyName, c) }); /* observe the content of the new array */
                    updateFunction('array swapped', change);
                });
            }

            observe(bindingProperties.bindingValue, (c) => { updateFunction('from value of ' + bindingProperties.propertyName, c) }); /* primitives, objects and content of arrays */
        }

        updateFunction('immediate');
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
    element: HTMLElement,
    isCacheable: boolean
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

// BindingEngine.handlers['transform'] = new TransformHandler();

BindingEngine.handlers['__attribute'] = new AttributeHandler();
BindingEngine.handlers['__property'] = new PropertyHandler();
BindingEngine.handlers['__event'] = new EventHandler();