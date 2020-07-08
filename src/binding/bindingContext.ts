export class BindingContext {
    template?: DocumentFragment;
    vm: any;
    propertyName: string;
    parameter?: string;

    constructor() {
        this.propertyName = '';
    }
}