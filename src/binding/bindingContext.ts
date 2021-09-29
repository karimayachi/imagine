export class BindingContext {
    template?: DocumentFragment;
    vm: any;
    originalVm: any; /* sometimes the binding context ends up being different from the one it was bound to; @if="user.loggedIn" -> now the context of this element is user, but children should bind to it's original parent */
    propertyName: string;
    parameter?: string;
    bindingData?: any; /* property used for bindings to store arbitrary data specific to that binding. Maybe 'parameter' should be consolidated with bindingData? */
    preventCircularUpdate: boolean;
    originalKey?: string; /* store original key and value for if we need to rebind this element/context */
    originalValue?: string; /* store original key and value for if we need to rebind this element/context */

    constructor() {
        this.propertyName = '';
        this.preventCircularUpdate = false;
    }
}