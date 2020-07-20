import { BindingContext } from './bindingContext';
import { bind, scopes, contexts, bindingEngine } from '../index';
import { IArraySplice, observe, observable, isObservableProp, IArrayChange } from 'mobx';
import { BindingProperties } from './bindingEngine';
import { changeDependenciesStateTo0 } from 'mobx/lib/internal';

export abstract class BindingHandler {
    abstract init?(element: HTMLElement, value: any, context: BindingContext, updateValue: (value: string) => void): void;
    abstract update?(element: HTMLElement, value: string, context: BindingContext, change?: any): void;
}

export class TextHandler implements BindingHandler {
    update(element: HTMLElement, value: string): void {
        element.innerText = value;
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
            updateValue((<HTMLInputElement>element).value);
        });
    }

    update(element: HTMLElement, value: string): void {
        (<HTMLInputElement>element).value = value;
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
        element.setAttribute(context.parameter!, value);
    }
}

export class ContextHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, _updateValue: (value: string) => void): void {
        let template: DocumentFragment = document.createDocumentFragment();

        while (element.childNodes.length > 0) {
            template.appendChild(element.childNodes[0]);
        }

        scopes.set(context.propertyName, context.vm);
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
            template.innerHTML = value;

            element.appendChild(template.content);
            setTimeout(() => { // Move init to back of callstack, so Custom Element is initialized first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
                for (let index = 0; index < element.childNodes.length; index++) {
                    bind(<HTMLElement>element.childNodes[index], context.vm);
                }
            }, 0);
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

        scopes.set(context.propertyName, context.vm);
        context.template = template;
    }

    update(element: HTMLElement, value: any, context: BindingContext, change: IArraySplice<any> | IArrayChange): void {
        if (change && change.type === 'splice') {
            for (let item of change.added) {
                addItem(item);
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
        else if(change && change.type === 'update') {
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

        function addItem(item: any) {
            if (context.template) {
                let content: DocumentFragment = <DocumentFragment>context.template.cloneNode(true);
                bind(content, item);

                /* insert selectedItem functionality */
                for (let i = 0; i < content.childNodes.length; i++) {
                    let itemElement: HTMLElement = <HTMLElement>content.childNodes[i];
                    if (itemElement.nodeType === 1) {
                        setTimeout(() => { // Move to back of callstack, so Binding is done first -- TODO MOVE THIS LOGIC TO BINDING ENGINE, MAYBE USE customElements.get to check
                            if ('selecteditem' in element && 'selected' in itemElement) {
                                let vm = {
                                    selected: observable.box(false)
                                };

                                let innerPreventCircularUpdate: boolean = false;

                                observe(vm.selected, change => {
                                    if (change.newValue === true && !innerPreventCircularUpdate) {
                                        innerPreventCircularUpdate = true;
                                        (<any>element).selecteditem = item;
                                    }
                                    innerPreventCircularUpdate = false;
                                });

                                if ((<any>element).selecteditem === item) {
                                    setTimeout(() => {// Move to back of callstack -- just moving to back of stack isn't even enough: set a small timeout.. This is very dangerous. TODO: Replace with polling for selected-property
                                        (<any>itemElement).selected = true;
                                    }, 10);
                                }
                                
                                observe(element, 'selecteditem', change => {
                                    if(!innerPreventCircularUpdate) {
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

                                let bindingProperties: BindingProperties = {
                                    handler: '__property',
                                    propertyName: 'selected',
                                    bindingValue: vm.selected,
                                    parameter: 'selected'
                                };
                                bindingEngine.bindInitPhase(itemElement, bindingProperties, vm);
                                bindingEngine.bindUpdatePhase(itemElement, bindingProperties, vm);
                            }
                        }, 0);
                    }
                }

                element.appendChild(content);
            }
        }
    }
}