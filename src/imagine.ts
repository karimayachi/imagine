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
        if (element.nodeName === '#document-fragment') {
            for (let index = 0; index < element.childNodes.length; index++) {
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
                if (children.indexOf(rootNode.childNodes[index]) > -1) {
                    this.recursiveBindNodes(rootNode.childNodes[index], vm);
                }
            }
        }
    }

    private bindAttributes(node: HTMLElement, vm: any) {
        /* first INIT all bindings */
        for (let index = node.attributes.length - 1; index >= 0; index--) {
            let parsedAttribute = this.bindingEngine.parseBinding(node.attributes[index].name, node.attributes[index].value, vm);
            if (parsedAttribute) {
                this.bindingEngine.bindInitPhase(node, parsedAttribute, vm);
            }
        }

        /* next UPDATE all bindings and remove attributes */
        for (let index = node.attributes.length - 1; index >= 0; index--) {
            let parsedAttribute = this.bindingEngine.parseBinding(node.attributes[index].name, node.attributes[index].value, vm);
            if (parsedAttribute) {
                this.bindingEngine.bindUpdatePhase(node, parsedAttribute, vm);
                node.removeAttribute(node.attributes[index].name);
            }
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
                    let parsedNode = this.bindingEngine.parseBinding('@text', matches![i].substring(2, matches![i].length - 1), vm);
                    if (parsedNode) {
                        this.bindingEngine.bindInitPhase(boundElement, parsedNode, vm);
                        this.bindingEngine.bindUpdatePhase(boundElement, parsedNode, vm);
                        newNodeList.push(boundElement);
                    }
                }
            }

            node.replaceWith(...newNodeList);
        }
    }
}
