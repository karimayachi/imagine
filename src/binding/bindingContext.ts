export class BindingContext {
    template?: DocumentFragment;
    vm: any;
    propertyName: string;

    constructor() {
        this.propertyName = '';
    }
}