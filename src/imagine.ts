import { BindingEngine } from './binding/bindingEngine';
import { BindingContext } from './binding/bindingContext';

export class Imagine {
    bindingEngine: BindingEngine;

    constructor() {
        this.bindingEngine = new BindingEngine();
    }

    bind = (element: HTMLElement | DocumentFragment | null, vm: any): void => {
        element = element || document.getElementsByTagName('body')[0];

        /* if this is a documentFragment assume a template ->
         * register the toplevel elements with a context, so we can find and remove them later */
        if(element.nodeName === '#document-fragment') { 
            for(let index = 0; index < element.childNodes.length; index++){
                let contextsForElement = new Map<string, BindingContext>();
                let context: BindingContext = new BindingContext();
                context.vm = vm;
                contextsForElement.set('template', context);
                this.bindingEngine.boundElements.set(<HTMLElement>element.childNodes[index], contextsForElement);
            }
        }
        
        this.recursiveBindNodes(element, vm);
    }

    private recursiveBindNodes(rootNode: Node, vm: any) {
        /* first preserve the child structure before the binding */
        let children: Node[] = [];
        for (let index = 0; index < rootNode.childNodes.length; index++) {
            children.push(rootNode.childNodes[index]);
        }

        if (rootNode.nodeType === 1) {
            this.bindAttributes(<HTMLElement>rootNode, vm);
        }

        if (rootNode.nodeType === 3) {
            this.bindInlinedText(<HTMLElement>rootNode, vm);
        }

        /* compare children with preserved list. Don't bind the children that were added by the binding 
         * and also don't bind the preserved children that were removed by the binding
         */
        if (rootNode.childNodes.length > 0) {
            for (let index = 0; index < rootNode.childNodes.length; index++) {
                if(children.indexOf(rootNode.childNodes[index]) > -1) {
                    this.recursiveBindNodes(rootNode.childNodes[index], vm);
                }
            }
        }
    }

    private bindAttributes(node: HTMLElement, vm: any) {
        /* first INIT all bindings */
        for (let index = node.attributes.length - 1; index >= 0; index--) {
            let parsedAttribute = this.parseAttribute(node.attributes[index].name);
            if(parsedAttribute.bindingHandler) {
                this.bindingEngine.bindInitPhase(parsedAttribute.bindingHandler, parsedAttribute.parameter, node, vm, node.attributes[index].value);
            }
        }
    
        /* next UPDATE all bindings and remove attributes */
        for (let index = node.attributes.length - 1; index >= 0; index--) {
            let parsedAttribute = this.parseAttribute(node.attributes[index].name);
            if(parsedAttribute.bindingHandler) {
                this.bindingEngine.bindUpdatePhase(parsedAttribute.bindingHandler, parsedAttribute.parameter, node, vm, node.attributes[index].value);
                node.removeAttribute(node.attributes[index].name);
            }
         }
    }

    private parseAttribute(attribute: string): { bindingHandler: string | null, parameter: string } {
        switch(attribute[0]) {
            case '@':
                return { bindingHandler: attribute.substr(1), parameter: '' };
            case ':':
                return { bindingHandler: '__property', parameter: attribute.substr(1) };
            case '_':
                return { bindingHandler: '__attribute', parameter: attribute.substr(1) };
            default:
                return { bindingHandler: null, parameter: '' };
        }
    }

    private bindInlinedText(node: HTMLElement, vm: any) {
        if (/\${[a-zA-Z]*}/.test(node.textContent!)) {
            let stringParts: string[] = node.textContent!.split(/\${[a-zA-Z]*}/);
            let matches: RegExpMatchArray | null = node.textContent!.match(/\${[a-zA-Z]*}/gm);
            let newNodeList: Node[] = [];

            for (let i = 0; i < stringParts.length; i++) {
                newNodeList.push(document.createTextNode(stringParts[i]));

                let boundElement: HTMLSpanElement = document.createElement('span');
                if (matches![i]) {
                    let propertyName: string = matches![i].substring(2, matches![i].length - 1);

                    this.bindingEngine.bindInitPhase('text', '', boundElement, vm, propertyName);
                    this.bindingEngine.bindUpdatePhase('text', '', boundElement, vm, propertyName);
                    newNodeList.push(boundElement);
                }
            }

            node.replaceWith(...newNodeList);
        }
    }
}
