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
<ul @foreach="genres">
    <li>${this}
        <a href="#" @onClick="genres.deleteGenre">delete</a>
    </li>
</ul>
```

It also automatically creates a Named Scope with the name of the array.

#### onClick
_Maybe there should be generic event-binding type and click is just one of infinite possibilities. For now it is a build in._
Binds a method on the viewmodel to be triggers by the click-event occurring.
```html
<a href="#" @onClick="createNew">new</a>
```

### Property / attribute bindings
The property and attribute bindings start with `:`. If the element exposes a property by the name of the binding (in the case of a Web Component for instance), the property will be two-way bound with the property on the viewmodel. If a property by that name doesn't exist, a one-way binding with an attribute of the same name will be created.

Property example:
```html
<mwc-switch :checked="premiumUser"></mwc-switch>
```

Attribtute example:
```html
<div :id="uniqueID" :class="theme"></div>
```

### Method bindings
**not yet implemented**

### Event bindings
**not yet implemented**