# Imagine

## Initialize
Use `bind(element, viewmodel)` to bind the viewmodel to a DOM element and it's children. Binds to `<body>` if no element is given. _(yeah, parameters should be swapped)_

```javascript
bind(document.getElementById('bindthis'), new ViewModel());
```

## Bindings
### Build ins
The build in bindings start with @ and should be used as attributes on a DOM element. They bind to the property on the viewmodel with the name provided.

#### text
```html
<span @text="title"></span>
```

#### value
Binds to the value of a form-field and responds to changes.
```html
<input type="text" @value="title"></input>
```
With Web Components it would also be possible to bind directly to the value-property with `:value`, but `@value` is a bit more robust when it comes to responding to change events.

#### foreach
Creates a template of the children of this element, binds an array of objects or primitives to this element and repeats the template for each item in the array. The child templates are bound to the item in the array.

```html
<ul @foreach="genres" :selectedItem="selectedGenre">
    <li>
        ${this}
        <a href="#" @onClick="genres.deleteGenre">delete</a>
    </li>
</ul>
```

**notes:**
- foreach automatically creates a Named Scope with the name of the array.
- foreach automatically creates an observable property `selectedItem` on the element that can be bound to.

#### with
The with binding creates a template of it's childnodes and hides them if the bound property is falsey (undefined, null, false, 0). If the value is not falsey, but (preferable) an object (class instance, vanille JS object, etc), the childnode-template becomes visible and bound to the object.

```html
<div @with="selectedPerson">
    <input @value="firstname"></input>
    <input @value="lastname"></input>
    <input type="checkbox" _checked="retired"></input>
</div>
```

_todo: update should update the bindings, not just replace entire content_

#### html
The html binding parses a html string and binds it's nodes to the current viewmodel / context.

```html
<div @with="currentView">
    <div @html="htmlContent"></div>
</div>
```

#### onClick
_Maybe there should be generic event-binding type and click is just one of infinite possibilities. For now it is a build in._
Binds a method on the viewmodel to be triggers by the click-event occurring.
```html
<a href="#" @onClick="createNew">new</a>
```

### Text bindings

Text bindings use a simplified 'template literal' syntax. Use `${propertyName}` to bind a property to have it's value formatted in the text. It's equivalent to `<span @text="propertyName"></span>`
```html
<div>Hi there ${name}, how are you today?</div>
```
is equivalent to
```html
<div>Hi there <span @text="name"></span>, how are you today?</div>
```

### Property bindings
The property bindings start with `:`. If the element exposes a property by the name of the binding, the property will be two-way bound with the property on the viewmodel. If a property by that name doesn't exist, an observable property will be to created to which the Viewmodel-property is bound.

_can't I just create a reference to the viewmodel property? hmm_
```html
<mwc-switch :checked="premiumUser"></mwc-switch>
```

### Attribute bindings
Attribute bindings start with `_` and are very similar to property bindings, but are used to update attributes on the element. In many Web Components these are reflected to properties, but they also work with regular html elements.

```html
<div _id="uniqueID" _class="theme"></div>
```

_todo: use Mutation Observers to create two way binding_

### Method bindings
not yet implemented

### Event bindings
not yet implemented