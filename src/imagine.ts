import { BindingEngine, BindingProperties } from './binding/bindingEngine';
import { BindingContext } from './binding/bindingContext';
import { bind, scopes } from './index';
import { isComputed } from 'mobx';

export const PROPERTY_SETTER_SYMBOL: unique symbol = Symbol();

export class Imagine {
    bindingEngine: BindingEngine;

    constructor() {
        this.bindingEngine = new BindingEngine();
    }

    bind = (vm: any, element?: Node | null, debug?: boolean): void => {
        if (debug) {
            (<any>window).__debug_imagine = this;
        }

        element = element || document.getElementsByTagName('body')[0];

        /* if this is a documentFragment assume a template ->
         * register the toplevel elements with a context, so we can find and remove them later */
        // WHAT DOES THIS EVEN DO?!!! REMOVE FOR NOW
        // if (element.nodeName === '#document-fragment') {
        //     for (let index = 0; index < element.childNodes.length; index++) {
        //         let contextsForElement = new Map<string, BindingContext>();
        //         let context: BindingContext = new BindingContext();
        //         context.vm = vm;
        //         contextsForElement.set('template', context);
        //         this.bindingEngine.boundElements.set(<HTMLElement>element.childNodes[index], contextsForElement);
        //     }
        // }

        this.recursiveBindNodes(element, vm);
    }

    // private recursiveBindNodes(rootNode: Node, vm: any) {
    //     /* first preserve the child structure before the binding */
    //     let children: Node[] = [];
    //     for (let index = 0; index < rootNode.childNodes.length; index++) {
    //         children.push(rootNode.childNodes[index]);
    //     }
    //     let someBindingControlsChildren: boolean = false;

    //     if (rootNode.nodeType === 1) {
    //         if ((<HTMLElement>rootNode).tagName === 'IMAGINE-TRANSFORM') {
    //             this.bindDirectives(<HTMLElement>rootNode, vm);
    //         }
    //         else {
    //             someBindingControlsChildren = this.bindAttributes(<HTMLElement>rootNode, vm);
    //         }
    //     }

    //     if (rootNode.nodeType === 3) {
    //         this.bindInlinedText(<HTMLElement>rootNode, vm);
    //     }

    //     /* compare children with preserved list. Don't bind the children that were added by the binding 
    //      * and also don't bind the preserved children that were removed by the binding
    //      */
    //     if (rootNode.childNodes.length > 0) {
    //         for (let index = rootNode.childNodes.length - 1; index >= 0; index--) {
    //             if (children.indexOf(rootNode.childNodes[index]) > -1) {
    //                 this.recursiveBindNodes(rootNode.childNodes[index], vm);
    //             }
    //         }
    //     }
    // }

    /**
     * Used in template-bindings (e.g. foreach) once (with the first item being bound)
     * to evaluate and cache all bindings in the template and update the stored
     * template with this information
     * @param vm 
     * @param context 
     * @returns a copy of the tempate bound to the VM
     */
    recursiveBindAndCache = (vm: any, context: BindingContext): HTMLElement | DocumentFragment => {
        /* Set the content to the (unprocessed) template.
         * Reset the template to empty 
         * bind the content and build a new pre-processed template along the way
         */
        let content: HTMLElement | DocumentFragment = <HTMLElement | DocumentFragment>context.template!;

        context.template = content.cloneNode(false);

        if (!context.cachedBindings) {
            context.cachedBindings = {};
        }

        this.recursiveBindNodesTemplate(content, vm, context.template, context.cachedBindings);

        return content;
    }

    /**
     * A variant of recursiveBindNodes that is used in recursiveBindAndCache
     * and build the content and binding-cache at the same time
     */
    private recursiveBindNodesTemplate(rootNode: Node, vm: any, templateNode: Node, cachedBindings: { [key: string]: BindingProperties[] }) {
        let dontProcessChildren: boolean = false;
        let copyBeforeBinding: NodeList = rootNode.cloneNode(true).childNodes;

        if (rootNode.nodeType === 1) {
            if ((<HTMLElement>rootNode).tagName === 'IMAGINE-TRANSFORM') {
                this.bindDirectives(<HTMLElement>rootNode, vm);
            }
            else {
                dontProcessChildren = this.bindAttributes(<HTMLElement>rootNode, vm, templateNode, cachedBindings);
            }
        }

        if (!dontProcessChildren) {
            /* first convert any text-node children that have inlined bindings (${...}) to full format (<span @text="...">) */
            for (let index = rootNode.childNodes.length - 1; index >= 0; index--) {
                if (rootNode.childNodes[index].nodeType === 3) {
                    this.convertInlineBindings(<HTMLElement>rootNode.childNodes[index]);
                }
            }

            for (let index = 0, stop = rootNode.childNodes.length; index < stop; index++) {
                const newChildTemplateNode = rootNode.childNodes[index].cloneNode(false);
                templateNode.appendChild(newChildTemplateNode);
                this.recursiveBindNodesTemplate(rootNode.childNodes[index], vm, newChildTemplateNode, cachedBindings);
            }
        }
        else { // if children are controlled by this sub-binding, then leave them in tact and put them in the template as-is
            for (let index = 0, stop = copyBeforeBinding.length; index < stop; index++) {
                templateNode.appendChild(copyBeforeBinding[index]);
            }
        }
    }

    private recursiveBindNodes(rootNode: Node, vm: any) {
        let someBindingControlsChildren: boolean = false;

        if (rootNode.nodeType === 1) {
            if ((<HTMLElement>rootNode).tagName === 'IMAGINE-TRANSFORM') {
                this.bindDirectives(<HTMLElement>rootNode, vm);
            }
            else {
                someBindingControlsChildren = this.bindAttributes(<HTMLElement>rootNode, vm);
            }
        }

        if (!someBindingControlsChildren) {
            /* first convert any text-node children that have inlined bindings (${...}) to full format (<span @text="...">) */
            for (let index = rootNode.childNodes.length - 1; index >= 0; index--) {
                if (rootNode.childNodes[index].nodeType === 3) {
                    this.convertInlineBindings(<HTMLElement>rootNode.childNodes[index]);
                }
            }

            for (let index = rootNode.childNodes.length - 1; index >= 0; index--) {
                this.recursiveBindNodes(rootNode.childNodes[index], vm);
            }
        }
    }

    finalizeCachedBinding = (vm: any, context: BindingContext): HTMLElement | DocumentFragment => {
        if (!context.cachedBindings) {
            throw ('Can\'t finalize binding that wasn\'t cached');
        }

        const content: HTMLElement = <HTMLElement>context.template!.cloneNode(true);

        for (let elementId of Object.keys(context.cachedBindings)) {
            const element: HTMLElement = content.dataset['bindingId'] === elementId ? content : <HTMLElement>content.querySelector(`[data-binding-id="${elementId}"]`);
            element.removeAttribute('data-binding-id');
            const cachedBindingsForElement: BindingProperties[] = context.cachedBindings[elementId];

            if (cachedBindingsForElement.length > 0) { // binding is cached
                for (let cachedBinding of cachedBindingsForElement) {

                    /* When retrieving preprocessed bindingproperties from cache, there can be three
                    * situations:
                    * 1. The VM and SCOPE are the same.. This goes for simple property bindings (e.g.) ${title}
                    *    in a @foreach="comments". title is a property on the first comment. 
                    *    So we need to swap out the original VM and SCOPE with the VM of newly added item
                    * 2. The VM and SCOPE are not the same, but SCOPE is independent of the newly added item
                    *    e.g. @if="globalScope.user.loggedIn"
                    *    In this case, we can just leave the SCOPE and BINDINGVALUE (and dependency tree?) in tact. 
                    * 3. The VM and SCOPE are not the same and SCOPE is dependent on the newly added item
                    *    e.g. ${author.name} in a @foreach="comments"
                    *    In this case the original pre-processed binding was a dependency tree looking
                    *    at the author of the first comment. This should be blocked by the parser and isCacheable
                    *    should be set to false
                    */
                    let newBindingValue, newVM, newScope;

                    if (cachedBinding.scope === cachedBinding.vm) {
                        newBindingValue = this.bindingEngine.getBindingValueFromProperty(cachedBinding.propertyName, vm);
                        newVM = vm;
                        newScope = vm;
                    }
                    else {
                        newBindingValue = cachedBinding.bindingValue;
                        newVM = vm;
                        newScope = cachedBinding.scope;
                    }

                    const bindingProperties: BindingProperties = {
                        handler: cachedBinding.handler,
                        parameter: cachedBinding.parameter,
                        propertyName: cachedBinding.propertyName,
                        isCacheable: cachedBinding.isCacheable,
                        scope: newScope,
                        vm: newVM,
                        bindingValue: newBindingValue,
                        element: element
                    };

                    this.bindingEngine.bindInitPhase(bindingProperties);
                    this.bindingEngine.bindUpdatePhase(bindingProperties);
                }
            }
            else { // binding is too complex to cache.. It wasn't cached, so re-bind
                bind(vm, element);
            }
        }

        return content;
    }

    /**
     * @returns true if any of the bindings has manipulated the children of this element and has taken responsibility for them
     */
    private bindAttributes(node: HTMLElement, vm: any, templateNode?: Node, cachedBindings?: { [key: string]: BindingProperties[] }): boolean {
        const allAttributes: { key: string, value: string, bindingProperties: BindingProperties }[] = [];
        const makeTemplate: boolean = !!templateNode && !!cachedBindings;

        let aBindingControlsChildren: boolean = false;
        let aBindingFailed: boolean = false;
        let elementId!: string;
        let elementContainsNonCacheableBinding: boolean = false;
        let elementContainsBindings: boolean = false;

        if (makeTemplate) {
            elementId = (Math.random() + 1).toString(36).substring(6);
        }

        for (let index = node.attributes.length - 1; index >= 0; index--) {
            const attributeName: string = node.attributes[index].name;
            const attributeValue: string = node.attributes[index].value;

            const bindingProperties = this.bindingEngine.parseBinding(attributeName, attributeValue, node, vm);

            if (bindingProperties !== undefined) { // undefined == not an Imagine attribute at all
                node.removeAttribute(attributeName);
                elementContainsBindings = true;
            }

            if (bindingProperties === null) { // null == an Imagine attribute, but failed to evaluate
                aBindingFailed = true;
            }

            if (bindingProperties) { //not null (=not able to parse) AND not undefined (=not an Imagine attribute)
                allAttributes.push({ key: attributeName, value: attributeValue, bindingProperties });
                if (!bindingProperties.isCacheable) {
                    elementContainsNonCacheableBinding = true;
                }
            }
        }

        if (makeTemplate && elementContainsBindings) {
            (<HTMLElement>templateNode).dataset['bindingId'] = elementId;
            cachedBindings![elementId] = [];

            if (!elementContainsNonCacheableBinding) {
                for (let parsedAttribute of allAttributes) {
                    (<HTMLElement>templateNode).removeAttribute(parsedAttribute.key);
                    cachedBindings![elementId].push(parsedAttribute.bindingProperties);
                }
            }
            else {
                console.warn('[Imagine] Using logic (transforms, conditional, ternary, etc) or a dependency tree in a template (if, foreach, etc) is not optimized. Every instance of the template has to be re-evaluated and can\'t be pre-computed.', templateNode);
            }
        }

        /* first INIT all bindings */
        for (let parsedAttribute of allAttributes) {
            const context: BindingContext = this.bindingEngine.bindInitPhase(parsedAttribute.bindingProperties);
            context.originalKey = parsedAttribute.key;
            context.originalValue = parsedAttribute.value;

            if (context.controlsChildren) {
                if (aBindingControlsChildren) {
                    throw ('Only one binding that controls its children is allowed per element');
                }
                else {
                    aBindingControlsChildren = true;
                }
            }
        }

        /* next UPDATE all bindings and remove attributes */
        for (let parsedAttribute of allAttributes) {
            this.bindingEngine.bindUpdatePhase(parsedAttribute.bindingProperties);
        }

        return aBindingControlsChildren || aBindingFailed; // in both cases don't further process children...
    }

    private bindDirectives(node: HTMLElement, vm: any) {
        /* only transform directive so far, so assume that */

        let attribute: string = node.getAttribute('TRANSFORM') || '';
        let parsedAttribute: BindingProperties | null | undefined = this.bindingEngine.parseBinding('@transform', attribute, node, vm);

        if (!parsedAttribute) return;

        parsedAttribute.parameter = node.getAttribute('TARGET') || ''; /* only TARGET is implemented.. NAME would be the other option */
        this.bindingEngine.bindInitPhase(parsedAttribute);
    }

    // private bindInlinedText(node: HTMLElement, vm: any): Node[] | undefined {
    //     let templateLiteralRegEx: RegExp = /\${[a-zA-Z.()\s?:']*}/gm;
    //     if (templateLiteralRegEx.test(node.textContent!)) {
    //         let stringParts: string[] = node.textContent!.split(templateLiteralRegEx);
    //         let matches: RegExpMatchArray | null = node.textContent!.match(templateLiteralRegEx);
    //         let newNodeList: Node[] = [];

    //         for (let i = 0; i < stringParts.length; i++) {
    //             if (stringParts[i].length > 0) {
    //                 newNodeList.push(document.createTextNode(stringParts[i]));
    //             }

    //             let boundElement: HTMLSpanElement = document.createElement('span');
    //             if (matches![i]) {
    //                 let parsedNode = this.bindingEngine.parseBinding('@text', matches![i].substring(2, matches![i].length - 1), boundElement, vm);
    //                 if (parsedNode) {
    //                     parsedNode.element = boundElement;
    //                     this.bindingEngine.bindInitPhase(parsedNode);
    //                     this.bindingEngine.bindUpdatePhase(parsedNode);
    //                 }

    //                 newNodeList.push(boundElement); // even if not bound keep it as a span in DOM. maybe the dependency tree will bind it later
    //             }
    //         }

    //         node.replaceWith(...newNodeList);

    //         return newNodeList;
    //     }
    // }

    private convertInlineBindings(node: HTMLElement): void {
        let templateLiteralRegEx: RegExp = /\${[a-zA-Z.()\s?:']*}/gm;
        if (templateLiteralRegEx.test(node.textContent!)) {
            let stringParts: string[] = node.textContent!.split(templateLiteralRegEx);
            let matches: RegExpMatchArray | null = node.textContent!.match(templateLiteralRegEx);
            let newNodeList: Node[] = [];

            for (let i = 0; i < stringParts.length; i++) {
                if (stringParts[i].length > 0) {
                    newNodeList.push(document.createTextNode(stringParts[i]));
                }

                if (matches![i]) {
                    let bindingElement: HTMLSpanElement = document.createElement('span');
                    bindingElement.setAttribute('data-text', matches![i].substring(2, matches![i].length - 1));
                    newNodeList.push(bindingElement);
                }
            }

            node.replaceWith(...newNodeList);
        }
    }
}
