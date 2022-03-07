import { Imagine } from './imagine';

declare global {
    interface Array<T> {
        remove(o: T): Array<T>
    }    
}

const ImagineInstance = new Imagine();

/* this arbitrarily exposing of members and having statics at the same time (BindingHandlers) is a mess :-) */
export { observable, computed, observe, decorate, isObservable, isObservableArray, isObservableProp, isObservableObject, getAtom, trace, autorun, reaction } from 'mobx';
export const bind = ImagineInstance.bind;
export const bindWithParent = ImagineInstance.bindWithParent;
export const recursiveBindAndCache = ImagineInstance.recursiveBindAndCache;
export const finalizeCachedBinding = ImagineInstance.finalizeCachedBinding;
export const contexts = ImagineInstance.bindingEngine.boundElements;
export const scopes = ImagineInstance.bindingEngine.scopes;
export const bindingEngine = ImagineInstance.bindingEngine;