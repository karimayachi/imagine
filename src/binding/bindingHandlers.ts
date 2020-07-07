import { BindingContext } from './bindingContext';
import { bind, scopes, contexts } from '../index';
import { IValueDidChange, IArrayChange, IMapDidChange, IArraySplice } from 'mobx';

export abstract class BindingHandler {
    abstract init?(element: HTMLElement, value: any, context: BindingContext, updateValue: (value: string) => void): void;
    abstract update?(element: HTMLElement, value: string, context: BindingContext, change?: any): void;
}

export class TextHandler implements BindingHandler {
    update(element: HTMLElement, value: string): void {
        element.innerText = value;
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

export class OnClickHandler implements BindingHandler {
    init(element: HTMLElement, property: Function, context: BindingContext): void {
        if (typeof property === 'function') {
            (<HTMLInputElement>element).addEventListener('click', (): void => {
                property(context.vm);
            });
        }
    }
}

export class ForEachHandler implements BindingHandler {
    init(element: HTMLElement, _value: any, context: BindingContext, _updateValue: (value: string) => void): void {
        let template: DocumentFragment = document.createDocumentFragment();

        while (element.childNodes.length > 0) {
            template.appendChild(element.childNodes[0]);
        }

        scopes.set(context.propertyName, context.vm);
        context.template = template;
    }

    update(element: HTMLElement, value: string, context: BindingContext, change: IArraySplice<any>): void {
        if (change) {
            for (let item of change.added) {
                if (context.template) {
                    let newItem: HTMLElement = <HTMLElement>context.template.cloneNode(true);
                    bind(newItem, item);
                    element.appendChild(newItem);
                }
            }

            for (let item of change.removed) {
                for(let index = element.childNodes.length - 1; index >= 0; index--) {
                    if(contexts.has(<HTMLElement>element.childNodes[index]) && 
                       contexts.get(<HTMLElement>element.childNodes[index])!.has('template')) {
                        let vm: any = contexts.get(<HTMLElement>element.childNodes[index])!.get('template')!.vm;
                        if(item === vm) {
                            element.childNodes[index].remove();
                        }
                    }
                }
            }
        }
        else {
            for (let item of value) {
                if (context.template) {
                    let content: DocumentFragment = <DocumentFragment>context.template.cloneNode(true);
                    bind(content, item);
                    element.appendChild(content);
                }
            }
        }
    }
}