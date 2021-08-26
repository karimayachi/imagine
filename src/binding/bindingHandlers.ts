import { BindingContext } from './bindingContext';
import { bind, scopes, contexts, bindingEngine } from '../index';
import { IArraySplice, observe, observable, IArrayChange } from 'mobx';
import { BindingProperties } from './bindingEngine';

export abstract class BindingHandler {
    abstract init?(element: HTMLElement, value: any, context: BindingContext, updateValue: (value: string) => void): void;
    abstract update?(element: HTMLElement, value: string | any, context: BindingContext, change?: any): void;
}

export class ComponentHandler implements BindingHandler {
    update(element: HTMLElement, value: any): void {
        if(value instanceof HTMLElement && value.tagName.includes('-')) { // assume value is a Web Component
            element.innerHTML = ''; // performance hit?
            element.appendChild(value);
        }
    }
}

export class TextHandler implements BindingHandler {
    update(element: HTMLElement, value: string): void {
        let transform = <Function | null>bindingEngine.getTransformFor(element, 'text');

        /* INSTEAD OF CHECKING FOR TRANSFORMS ON EVERY UPDATE, CHECK ONCE IN INIT AND STORE TRANSFORMS IN CONTEXT */
        if (transform) {
            element.textContent = transform(value);
        }
        else {
            element.textContent = value;
        }
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
        (<HTMLInputElement>element).addEventListener('input', (): void => {
            let transform = <{ read: Function, write: Function } | null>bindingEngine.getTransformFor(element, 'value');

            /* INSTEAD OF CHECKING FOR TRANSFORMS ON EVERY UPDATE, CHECK ONCE IN INIT AND STORE TRANSFORMS IN CONTEXT */
            if (transform && transform.write) {
                updateValue(transform.write((<HTMLInputElement>element).value));
            }
            else {
                updateValue((<HTMLInputElement>element).value);
            }
        });
    }

    update(element: HTMLElement, value: string): void {
        let transform = <{ read: Function, write: Function } | null>bindingEngine.getTransformFor(element, 'value');

        /* INSTEAD OF CHECKING FOR TRANSFORMS ON EVERY UPDATE, CHECK ONCE IN INIT AND STORE TRANSFORMS IN CONTEXT */
        if (transform && transform.read) {
            (<HTMLInputElement>element).value = transform.read(value);
        }
        else {
            (<HTMLInputElement>element).value = value;
        }
    }
}

export class EventHandler implements BindingHandler {
    init(element: HTMLElement, value: any, context: BindingContext): void {
        if (typeof value === 'function') {
            (<HTMLInputElement>element).addEventListener(context.parameter!, (event: Event): void => {
                value(context.vm, event);
            });
        }
    }
}

export class AttributeHandler implements BindingHandler {
    update(element: HTMLElement, value: string, context: BindingContext): void {
        setTimeout(() => {
            let transform = <Function | null>bindingEngine.getTransformFor(element, 'attribute.' + context.parameter);

            /* INSTEAD OF CHECKING FOR TRANSFORMS ON EVERY UPDATE, CHECK ONCE IN INIT AND STORE TRANSFORMS IN CONTEXT */
            if (transform) {
                element.setAttribute(context.parameter!, transform(value));
            }
            else {
                element.setAttribute(context.parameter!, value);
            }
        }, 0);
    }
}

export class ScopeHandler implements BindingHandler {
    init(_element: HTMLElement, value: any, context: BindingContext, _updateValue: (value: string) => void): void {
        scopes.set(value, context.vm);
    }
}

export class TransformHandler implements BindingHandler {
    init(_element: HTMLElement, value: any, context: BindingContext, _updateValue: (value: string) => void): void {

    }
}

export class IfHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, _updateValue: (value: string) => void): void {
        let template: DocumentFragment = document.createDocumentFragment();

        while (element.childNodes.length > 0) {
            template.appendChild(element.childNodes[0]);
        }

        context.template = template;
    }

    update(element: HTMLElement, value: string, context: BindingContext, _change: IArraySplice<any>): void {
        element.innerText = '';

        if (value && context.template) {
            let newItem: HTMLElement = <HTMLElement>context.template.cloneNode(true);
            bind(newItem, context.originalVm);
            element.appendChild(newItem);
        }
    }
}

export class ContextHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, _updateValue: (value: string) => void): void {
        let template: DocumentFragment = document.createDocumentFragment();

        while (element.childNodes.length > 0) {
            template.appendChild(element.childNodes[0]);
        }

        //scopes.set(context.propertyName, context.vm);
        context.template = template;
    }

    update(element: HTMLElement, value: string, context: BindingContext, change: IArraySplice<any>): void {
        element.innerText = '';

        if (value !== undefined && value !== null && context.template) {
            let newItem: HTMLElement = <HTMLElement>context.template.cloneNode(true);
            bind(newItem, value);
            element.appendChild(newItem);
        }
    }
}

export class HtmlHandler implements BindingHandler {
    update(element: HTMLElement, value: string, context: BindingContext, change: IArraySplice<any>): void {
        element.innerText = '';

        if (value !== undefined && value !== null) {
            let template: HTMLTemplateElement = document.createElement('template');
            let transform = <Function | null>bindingEngine.getTransformFor(element, 'html');

            /* INSTEAD OF CHECKING FOR TRANSFORMS ON EVERY UPDATE, CHECK ONCE IN INIT AND STORE TRANSFORMS IN CONTEXT */
            if (transform) {
                template.innerHTML = transform(value);
            }
            else {
                template.innerHTML = value;
            }

            element.appendChild(template.content);
            setTimeout(() => { // Move init to back of callstack, so Custom Element is initialized first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
                for (let index = 0; index < element.childNodes.length; index++) {
                    bind(<HTMLElement>element.childNodes[index], context.vm);
                }
            }, 0);
        }
    }
}

export class ContentHandler implements BindingHandler {
    update(element: HTMLElement, value: any, context: BindingContext, change: IArraySplice<any>): void {
        if (value && value.contentTemplate) {
            element.innerHTML = value.contentTemplate;
            bind(element, value);
        }
        else {
            element.innerText = '';
        }
    }
}

export class ForEachHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, _updateValue: (value: string) => void): void {
        /* save the childnodes as template in the context */
        let template: DocumentFragment = document.createDocumentFragment();

        while (element.childNodes.length > 0) {
            template.appendChild(element.childNodes[0]);
        }

        //scopes.set(context.propertyName, context.vm);
        context.template = template;
    }

    update(element: HTMLElement & { selecteditems: any[], selecteditem: any }, value: any, context: BindingContext, change: IArraySplice<any> | IArrayChange): void {
        if (change && change.type === 'splice') {
            for (let item of change.added) {
                addItem(item, change.index);
            }

            for (let item of change.removed) {
                for (let index = element.childNodes.length - 1; index >= 0; index--) {
                    if (contexts.has(<HTMLElement>element.childNodes[index]) &&
                        contexts.get(<HTMLElement>element.childNodes[index])!.has('template')) {
                        let vm: any = contexts.get(<HTMLElement>element.childNodes[index])!.get('template')!.vm;
                        if (item === vm) {
                            element.childNodes[index].remove();
                        }
                    }
                }
            }
        }
        else if (change && change.type === 'update') {
            element.innerHTML = ''; /* TODO: does this sufficiently trigger GC? do the bindings disappear from the weakmap AND underlying map? */

            for (let item of change.newValue) {
                addItem(item);
            }
        }
        else {
            for (let item of value) {
                addItem(item);
            }
        }

        function addItem(item: any, index?: number) {
            if (context.template) {
                let content: DocumentFragment = <DocumentFragment>context.template.cloneNode(true);
                bind(content, item);

                /* insert selectedItem functionality */
                for (let i = 0; i < content.childNodes.length; i++) {
                    let itemElement: HTMLElement = <HTMLElement>content.childNodes[i];
                    if (itemElement.nodeType === 1) {
                        setTimeout(() => { // Move to back of callstack, so Binding is done first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
                            if ('selected' in itemElement && ('selecteditem' in element || 'selecteditems' in element)) {
                                if ('selecteditems' in element && (<any>element).selecteditems === undefined) { /* we don't have to do this for every added item, but this setTimeout has the right timing. Maybe optimize it later */
                                    (<any>element).selecteditems = [];
                                }

                                let vm = {
                                    selected: observable.box(false)
                                };

                                let innerPreventCircularUpdate: boolean = false;

                                observe(vm.selected, change => {
                                    if (change.newValue === true && !innerPreventCircularUpdate) {
                                        innerPreventCircularUpdate = true;
                                        if ('selecteditem' in element) {
                                            (<any>element).selecteditem = item;
                                        }
                                        if ('selecteditems' in element) {
                                            if ((<any>element).selecteditems.indexOf(item) === -1) {
                                                (<any>element).selecteditems.push(item);
                                            }
                                        }
                                    }
                                    else if (change.newValue === false && !innerPreventCircularUpdate && 'selecteditems' in element) {
                                        innerPreventCircularUpdate = true;
                                        if ((<any>element).selecteditems.indexOf(item) > -1) {
                                            (<any>element).selecteditems.splice((<any>element).selecteditems.indexOf(item), 1);
                                        }
                                    }
                                    innerPreventCircularUpdate = false;
                                });

                                if ('selecteditem' in element) {
                                    if ((<any>element).selecteditem === item) {
                                        setTimeout(() => {// Move to back of callstack -- just moving to back of stack isn't even enough: set a small timeout.. This is very dangerous. TODO: Replace with polling for selected-property
                                            (<any>itemElement).selected = true;
                                        }, 10);
                                    }

                                    observe(element, 'selecteditem', change => {
                                        if (!innerPreventCircularUpdate) {
                                            innerPreventCircularUpdate = true;

                                            if (change.newValue === item) {
                                                (<any>itemElement).selected = true;
                                            }
                                            else {
                                                (<any>itemElement).selected = false;
                                            }
                                        }

                                        innerPreventCircularUpdate = false;
                                    });
                                }

                                if ('selecteditems' in element) {
                                    if ((<any>element).selecteditems.indexOf(item) > -1) {
                                        setTimeout(() => {// Move to back of callstack -- just moving to back of stack isn't even enough: set a small timeout.. This is very dangerous. TODO: Replace with polling for selected-property
                                            (<any>itemElement).selected = true;
                                        }, 10);
                                    }

                                    observe(element, 'selecteditems', change => {
                                        if (!innerPreventCircularUpdate) {
                                            innerPreventCircularUpdate = true;

                                            if ((<any[]>change.newValue).indexOf(item) > -1) {
                                                (<any>itemElement).selected = true;
                                            }
                                            else {
                                                (<any>itemElement).selected = false;
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
                                    parameter: 'selected',
                                    element: itemElement
                                };
                                bindingEngine.bindInitPhase(bindingProperties);
                                bindingEngine.bindUpdatePhase(bindingProperties);
                            }
                        }, 0);
                    }
                }

                if (index !== undefined) {
                    element.insertBefore(content, element.children[index]);
                }
                else {
                    element.appendChild(content);
                }
            }
        }
    }
}