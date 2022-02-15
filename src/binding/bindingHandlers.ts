import { BindingContext } from './bindingContext';
import { bind, scopes, bindingEngine, recursiveBindAndCache, finalizeCachedBinding, contexts } from '../index';
import { IArraySplice, observe, observable, IArrayChange, getAtom, IObservableArray } from 'mobx';
import { BindingProperties } from './bindingEngine';

export abstract class BindingHandler {
    /**
     * @returns true if the handler controls it's child elements directly, false or nothing if the parents binding context needs to take care of that
     */
    abstract init?(element: HTMLElement, value: any, context: BindingContext, updateValue: (value: string) => void): boolean | void;
    abstract update?(element: HTMLElement, value: string | any, context: BindingContext, change?: any): void;
}

export class ComponentHandler implements BindingHandler {
    init() {
        return true; // this handler controls its own children
    }

    update(element: HTMLElement, value: any): void {
        if (value instanceof HTMLElement && value.tagName.includes('-')) { // assume value is a Web Component
            element.innerHTML = ''; // performance hit?
            element.appendChild(value);
        }
    }
}

export class TextHandler implements BindingHandler {
    update(element: HTMLElement, value: string): void {
        // let transform = <{ read: Function } | Function | null>bindingEngine.getTransformFor(element, 'text');

        // /* INSTEAD OF CHECKING FOR TRANSFORMS ON EVERY UPDATE, CHECK ONCE IN INIT AND STORE TRANSFORMS IN CONTEXT */
        // if (transform && (<{ read: Function }>transform).read && typeof (<{ read: Function }>transform).read === 'function') {
        //     element.textContent = (<{ read: Function }>transform).read(value);
        // }
        // else if (transform && typeof transform === 'function') {
        //     element.textContent = transform(value);
        // }
        // else {
        //     element.textContent = value;
        // }

        element.textContent = value;
    }
}

export class VisibleHandler implements BindingHandler {
    initialValue?: string; /* TERRIBLE MISTAKE!!! there's only one instance of this class, used by all bindings. So this value will be overwritten.
                              TODO: either change this into a WeakMap with references per element, or move this as a parameter to the binding context */

    init = (element: HTMLElement): void => {
        this.initialValue = getComputedStyle(element).display;
    }

    update = (element: HTMLElement, value: string): void => {
        element.style.display = value ? this.initialValue! : 'none';
    }
}

export class ValueHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, _contex: BindingContext, updateValue: (value: string) => void): void {
        // (<HTMLInputElement>element).addEventListener('input', (): void => {
        //     let transform = <{ read: Function, write: Function } | null>bindingEngine.getTransformFor(element, 'value');

        //     /* INSTEAD OF CHECKING FOR TRANSFORMS ON EVERY UPDATE, CHECK ONCE IN INIT AND STORE TRANSFORMS IN CONTEXT */
        //     if (transform && transform.write) {
        //         updateValue(transform.write((<HTMLInputElement>element).value));
        //     }
        //     else {
        //         updateValue((<HTMLInputElement>element).value);
        //     }
        // });

        updateValue((<HTMLInputElement>element).value);
    }

    update(element: HTMLElement, value: string): void {
        // let transform = <{ read: Function } | Function | null>bindingEngine.getTransformFor(element, 'value');

        // /* INSTEAD OF CHECKING FOR TRANSFORMS ON EVERY UPDATE, CHECK ONCE IN INIT AND STORE TRANSFORMS IN CONTEXT */
        // if (transform && (<{ read: Function }>transform).read && typeof (<{ read: Function }>transform).read === 'function') {
        //     (<HTMLInputElement>element).value = (<{ read: Function }>transform).read(value);
        // }
        // else if (transform && typeof transform === 'function') {
        //     (<HTMLInputElement>element).value = transform(value);
        // }
        // else {
        //     (<HTMLInputElement>element).value = value;
        // }

        (<HTMLInputElement>element).value = value;
    }
}

export class EventHandler implements BindingHandler {
    init(element: HTMLElement, value: any, context: BindingContext): void {
        if (typeof value === 'function') {
            (<HTMLInputElement>element).addEventListener(context.parameter!, (event: Event): void => {
                event.stopPropagation();
                value(context.originalVm, event);
            });
        }
    }
}

export class AttributeHandler implements BindingHandler {
    update(element: HTMLElement, value: string, context: BindingContext): void {
        // let transform = <{ read: Function } | Function | null>bindingEngine.getTransformFor(element, 'attribute.' + context.parameter);

        // /* INSTEAD OF CHECKING FOR TRANSFORMS ON EVERY UPDATE, CHECK ONCE IN INIT AND STORE TRANSFORMS IN CONTEXT */
        // if (transform && (<{ read: Function }>transform).read && typeof (<{ read: Function }>transform).read === 'function') {
        //     element.setAttribute(context.parameter!, (<{ read: Function }>transform).read(value));
        // }
        // else if (transform && typeof transform === 'function') {
        //     element.setAttribute(context.parameter!, transform(value));
        // }
        // else {
        //     element.setAttribute(context.parameter!, value);
        // }

        element.setAttribute(context.parameter!, value);
    }
}

export class ScopeHandler implements BindingHandler {
    init(_element: HTMLElement, value: any, context: BindingContext, _updateValue: (value: string) => void): void {
        scopes.set(value, context.vm);
    }
}

// export class TransformHandler implements BindingHandler {
//     init(_element: HTMLElement, value: any, context: BindingContext, _updateValue: (value: string) => void): void {

//     }
// }

export class IfHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, _updateValue: (value: string) => void): boolean {
        // setTimeout(() => { // Give custom elements time to render before clearing -- TODO create task management system
            context.template = createTemplate(element);
        // }, 0);

        return true; // this binding controls its own children
    }

    update(element: HTMLElement, value: string, context: BindingContext, _change: IArraySplice<any>): void {
        // /* INSTEAD OF CHECKING FOR TRANSFORMS ON EVERY UPDATE, CHECK ONCE IN INIT AND STORE TRANSFORMS IN CONTEXT */
        // let transform = <{ read: Function } | Function | null>bindingEngine.getTransformFor(element, 'if');
        // if (transform && typeof transform === 'function') {
        //     value = transform(value);
        // }

        // setTimeout(() => { // Give custom elements time to render before clearing -- TODO create task management system
            element.innerText = '';

            if (value && context.template) {
                let newItem: HTMLElement = <HTMLElement>context.template.cloneNode(true);
                bind(context.originalVm, newItem);
                element.appendChild(newItem);
            }
        // }, 0);
    }
}

export class ContextHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, _updateValue: (value: string) => void): boolean {
        let template: DocumentFragment = document.createDocumentFragment();

        while (element.childNodes.length > 0) {
            template.appendChild(element.childNodes[0]);
        }

        //scopes.set(context.propertyName, context.vm);
        context.template = template;

        return true; // this binding controls its own children
    }

    update(element: HTMLElement, value: string, context: BindingContext, change: IArraySplice<any>): void {
        element.innerText = '';

        if (value !== undefined && value !== null && context.template) {
            let newItem: HTMLElement = <HTMLElement>context.template.cloneNode(true);
            bind(value, newItem);
            element.appendChild(newItem);
        }
    }
}

export class HtmlHandler implements BindingHandler {
    init(): boolean {
        return true; // this binding controls its own children
    }

    update(element: HTMLElement, value: string, context: BindingContext, change: IArraySplice<any>): void {
        element.innerText = '';

        if (value !== undefined && value !== null) {
            let template: HTMLTemplateElement = document.createElement('template');
            // let transform = <{ read: Function } | Function | null>bindingEngine.getTransformFor(element, 'html');

            // /* INSTEAD OF CHECKING FOR TRANSFORMS ON EVERY UPDATE, CHECK ONCE IN INIT AND STORE TRANSFORMS IN CONTEXT */
            // if (transform && (<{ read: Function }>transform).read && typeof (<{ read: Function }>transform).read === 'function') {
            //     template.innerHTML = (<{ read: Function }>transform).read(value);
            // }
            // else if (transform && typeof transform === 'function') {
            //     template.innerHTML = transform(value);
            // }
            // else {
            //     template.innerHTML = value;
            // }
            template.innerHTML = value;

            element.appendChild(template.content);
            setTimeout(() => { // Move init to back of callstack, so Custom Element is initialized first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
                for (let index = 0; index < element.childNodes.length; index++) {
                    bind(context.originalVm, <HTMLElement>element.childNodes[index]);
                }
            }, 0);
        }
    }
}

export class ContentHandler implements BindingHandler {
    init(): boolean {
        return true; // this binding controls its own children
    }

    update(element: HTMLElement, value: any, context: BindingContext, change: IArraySplice<any>): void {
        let vm: any;

        if(typeof value === 'function') { 
            vm = new value(context.originalVm);
        }
        else {
            vm = value;
        }

        if (vm && vm.contentTemplate) {
            element.innerHTML = vm.contentTemplate;
            bind(vm, element);
        }
        else {
            element.innerText = '';
        }
    }
}

export class ForEachHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, _updateValue: (value: string) => void): boolean {
        /* set up a index-tracker between array and HTML-elements. Facilitates removing and replacing items and speeding up */
        context.bindingData = [];

        //scopes.set(context.propertyName, context.vm);
        context.template = createTemplate(element);

        return true; // this binding controls its own children
    }

    update(element: HTMLElement & { selecteditems: any[], selecteditem: any }, value: any, context: BindingContext, change: IArraySplice<any> | IArrayChange): void {
        if (!context.template) return;

        const addedWebComponents: { webcomponents: ChildNode[] | null, item: any }[] = [];

        if (change && change.type === 'splice') { /* items are added or removed */
            /* remove items */
            if (change.removedCount > 0) {
                for (let i = 0; i < change.removedCount; i++) {
                    context.bindingData[change.index].forEach((element: HTMLElement) => { element.remove(); });
                }

                (<any[]>context.bindingData).splice(change.index, change.removed.length);
            }

            /* add items */
            const index = change.index === context.bindingData.length ? undefined : change.index; /* if the start index is at the end, consider this a push/add and not a insert/splice, so omit the index parameter */

            for (let i = 0; i < change.addedCount; i++) {
                let { webcomponents } = addItem(change.added[i], index);
                if (webcomponents !== null) {
                    addedWebComponents.push({ webcomponents, item: change.added[i] });
                }
            }
        }
        else if (change && change.type === 'update') {
            if (change.object === value) { /* an item IN the array is updated */
                context.bindingData[change.index].forEach((element: HTMLElement) => {
                    bindingEngine.recursiveRebindAll(element, change.newValue);
                });
            }
            else { /* the complete array is swapped out for a new array */
                element.innerHTML = ''; /* TODO: does this sufficiently trigger GC? do the bindings disappear from the weakmap AND underlying map? */
                context.bindingData = [];

                for (let item of change.newValue) {
                    let { webcomponents } = addItem(item);
                    if (webcomponents !== null) {
                        addedWebComponents.push({ webcomponents, item });
                    }
                }
            }
        }
        else { /* first fill of array - no change */
            for (let item of value) {
                let { webcomponents } = addItem(item);
                if (webcomponents !== null) {
                    addedWebComponents.push({ webcomponents, item });
                }
            }
        }

        /* if the foreach parent node is a WebComponent and has at least some WebComponent children
         * added, it is a candidate for injecting selectedItem(s) functionality
         */
        if (element.tagName.includes('-') && addedWebComponents.length > 0) {
            setTimeout(() => {
                hookUpSelectedItems(addedWebComponents);
            }, 0);
        }

        /**
         * Creates a new instance of foreach-template and binds it to the new item (VM).
         * If the template is a WebComponent, return it, so after adding all items
         * it can be used to inject selectedItem(s) functionality
         * @returns the new instance of the template any WebComponents that were added
         */
        function addItem(item: any, index?: number): { webcomponents: ChildNode[] | null } {
            let content: HTMLElement | DocumentFragment;

            if (!context.cachedBindings) {
                content = recursiveBindAndCache(item, context);
            }
            else {
                content = finalizeCachedBinding(item, context);
            }

            /* Keep reference between index of array element and html element
             * use WeakRef on browsers that support it, but normal reference on
             * legacy browser. Potential memory leak if html elements are remove from
             * outside of Imagine.
             * Also other manipulations from outside of Image (swapping, moving)
             * could cause problems. Use MutationObserver to react to this?
             * 
             * Wouldn't it be better (and easier) to use a WeakMap with the actual items
             * as index, in stead of a seperate number index?
             */
            let elementsToAdd: ChildNode[];
            if(content instanceof DocumentFragment) {
                elementsToAdd = Array.from(content.childNodes); /* .childNodes seems to be a bit faster than .children (Chrome 94) (and we already remove non-elements from the template anyway, so childNodes is safe) */
            }
            else {
                elementsToAdd = [content];
            }

            if (index !== undefined) { /* splice is very expensive, so only use if absolutely necessary. Otherwise just push */
                (<any[]>context.bindingData).splice(index, 0, elementsToAdd); /* insert at start index */
                element.insertBefore(content, element.children[index]);
            }
            else {
                (<any[]>context.bindingData).push(elementsToAdd);
                element.appendChild(content);
            }
            
            /* find web-components in added nodes */
            let webcomponents: ChildNode[] = [];
            for(let el of (<HTMLElement[]>elementsToAdd)) {
                if('tagName' in el && el.tagName.includes('-')) {
                    webcomponents.push(el);
                }
                for(let child of (<HTMLElement>el).querySelectorAll('*')) {
                    if('tagName' in child && child.tagName.includes('-')) {
                        webcomponents.push(child);
                    }
                }
            }

            return { webcomponents: webcomponents.length > 0 ? webcomponents : null };
        }

        function hookUpSelectedItems(webcomponents: { webcomponents: ChildNode[] | null, item: any }[]) {
            if(!('selecteditem' in element || 'selecteditems' in element)) {
                return;
            }

            if ('selecteditems' in element && element.selecteditems === undefined) {
                (<IObservableArray>element.selecteditems) = observable.array([]);
            }

            for (let webcomponent of webcomponents) {
                if (webcomponent.webcomponents === null) continue;

                const item: any = webcomponent.item;

                for (let i = 0; i < webcomponent.webcomponents.length; i++) {
                    const itemElement: HTMLElement = <HTMLElement>webcomponent.webcomponents[i];

                    if (('selected' in itemElement || 'checked' in itemElement)) {
                        const selectedOrChecked: string = 'selected' in itemElement ? 'selected' : 'checked';

                        const vm = {
                            selected: observable.box(false)
                        };

                        let innerPreventCircularUpdate: boolean = false;

                        observe(vm.selected, change => {
                            if (change.newValue === true && !innerPreventCircularUpdate) { // check
                                innerPreventCircularUpdate = true;

                                if ('selecteditem' in element) {
                                    element.selecteditem = item;
                                }
                                if ('selecteditems' in element) {
                                    /* the array in .selecteditem is the same as the one bound to it in the VM.
                                     * So pushing onto it directly pushes onto the VM. This should not be reflected back 
                                     */
                                    const parentContext: BindingContext | undefined = contexts.get(element)?.get('__property:selecteditems');
                                    if (parentContext) {
                                        parentContext.preventCircularUpdateIn = true;
                                    }

                                    if (element.selecteditems.indexOf(item) === -1) {
                                        element.selecteditems.push(item);
                                    }
                                }
                            }
                            else if (change.newValue === false && !innerPreventCircularUpdate && 'selecteditems' in element) { // uncheck
                                innerPreventCircularUpdate = true;
                                if (element.selecteditems.indexOf(item) > -1) {
                                    element.selecteditems.splice(element.selecteditems.indexOf(item), 1);
                                }
                            }
                            innerPreventCircularUpdate = false;
                        });

                        if ('selecteditem' in element) {
                            if ((<any>element).selecteditem === item) {
                                setTimeout(() => {// Move to back of callstack -- just moving to back of stack isn't even enough: set a small timeout.. This is very dangerous. TODO: Replace with polling for selected-property
                                    (<any>itemElement)[selectedOrChecked] = true;
                                }, 10);
                            }

                            observe(element, 'selecteditem', change => {
                                if (!innerPreventCircularUpdate) {
                                    innerPreventCircularUpdate = true;

                                    if (change.newValue === item) {
                                        (<any>itemElement)[selectedOrChecked] = true;
                                    }
                                    else {
                                        (<any>itemElement)[selectedOrChecked] = false;
                                    }
                                }

                                innerPreventCircularUpdate = false;
                            });
                        }

                        if ('selecteditems' in element) {
                            if ((<any>element).selecteditems.indexOf(item) > -1) {
                                setTimeout(() => {// Move to back of callstack -- just moving to back of stack isn't even enough: set a small timeout.. This is very dangerous. TODO: Replace with polling for selected-property
                                    (<any>itemElement)[selectedOrChecked] = true;
                                }, 10);
                            }

                            observe(element, 'selecteditems', change => {
                                if (!innerPreventCircularUpdate) {
                                    innerPreventCircularUpdate = true;

                                    if ((<any[]>change.newValue).indexOf(item) > -1) {
                                        (<any>itemElement)[selectedOrChecked] = true;
                                    }
                                    else {
                                        (<any>itemElement)[selectedOrChecked] = false;
                                    }
                                }

                                innerPreventCircularUpdate = false;
                            });
                        }

                        let bindingProperties: BindingProperties = {
                            handler: '__property',
                            propertyName: 'selected',
                            bindingValue: vm.selected,
                            scope: vm,
                            vm: vm,
                            parameter: selectedOrChecked,
                            element: itemElement,
                            isCacheable: true
                        };
                        bindingEngine.bindInitPhase(bindingProperties);
                        bindingEngine.bindUpdatePhase(bindingProperties);

                        break; // Stop at first element that implements selected or checked
                    }
                }
            }
        }
    }
}

function createTemplate(element: HTMLElement): Node {
    /* save the child elements as template in the context
     * don't allow textNodes at top level template, only use elements
     */
    let template: Node

    /* a single element seams to be a lot faster in appendChild and cloneNode than a DocumentFragment
     * so if there is only 1 top-level element in this template, don't bother with the DocumentFragment
     */
    if (element.children.length === 1) {
        template = element.removeChild(element.children[0]);
    }
    else {
        template = document.createDocumentFragment();

        while (element.children.length > 0) {
            template.appendChild(element.children[0]);
        }
    }

    /* also filter out the empty text-nodes (line-feeds, white spaces, etc) 
     * between elements and legit text-nodes
     * in theory this would speed up appendChild and cloneNode,
     * but it's a very small difference --- can't hurt either
     */
    let recursiveCleanFragment = (parent: Node, node: Node) => {
        if (node.nodeType === 3 && node.textContent?.trim() === '') {
            parent.removeChild(node);
        }
        for (let i = node.childNodes.length - 1; i >= 0; i--) {
            recursiveCleanFragment(node, node.childNodes[i]);
        }
    }
    template.normalize(); // merge adjecent text-nodes
    recursiveCleanFragment(element, template);

    return template;
}