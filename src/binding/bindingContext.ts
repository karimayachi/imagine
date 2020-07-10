export class BindingContext {
    template?: DocumentFragment;
    vm: any;
    propertyName: string;
    parameter?: string;
    preventCircularUpdate: boolean;

    constructor() {
        this.propertyName = '';
        this.preventCircularUpdate = false;
    }
}