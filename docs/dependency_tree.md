# Dependency tree
Anyone who has ever worked with "classical" MVVM libraries will recognize the following problem. If you bind a nested property to your view, all sorts of things can go wrong. Consider the following example. We want to show the name of the author of some blog-post in a view. We could do:
```html
<span>${post.author.firstname}</span>
```
But then both the post and the author within that post need to be available at binding time to find the `firstname` property and bind to it. It's usually not the case that everything is already available. This type of data is usually asynchronously loaded from an API.
```javascript
class ViewModel {
    @observable post;

    constructor() {
        const response = await fetch('someapi/getpost/1');
        this.post = await response.json();
    }
}
```
In most libraries the binding will fail, because `post` is `undefined` at time of binding and neither author, nor firstname can be read. Even if everything is available at binding time and the binding succeeds: now there is a binding with the firstname property of this specific author, belonging to this specific post. If either the complete post, or the author object are replaced, the binding will not update, because it is still bound to the originel author's firstname.

One solution to this would be to make sure the structure exists and doesn't change, only the outer properties are updated. Example in [KnockoutJS](https://knockoutjs.com):
```javascript
class ViewModel {
    post;

    constructor() {
        this.post = {
            author: {
                firstname: ko.observable()
            }
        };

        const response = await fetch('someapi/getpost/1');
        const post = await response.json();

        this.post.author.firstname(post.author.firstname);
        // repeat this for all properties that need to be bound
    }
}
```

Another option would be to introduce conditional logic in the view. Again an example in KnockoutJS:
```html
<!-- ko if: post() !== null -->
    <!-- ko if: post().author() !== null -->
        <span data-bind="text: post().author().firstname"></span>
    <!-- /ko -->
<!-- /ko -->
```
Both solutions are less than optimal. They both violated semantic and declarative principles.

Imagine addresses this problem by not just trying to bind `firstname`, but to consider the whole path `post.author.firstname` and create a dependency tree. It will observe every branche of this tree and respond to changes at any level. If any part of the path is currently empty (`null` or `undefined`) it will not fail, but just stop trying to bind for now, store the HTML and wait until something changes. If it detects a change in either post or author) it will try again.

Similarly, if firstname is already bound and shown in the view, but the whole post object is replaced (or just the author object), it will detect the change an re-bind the view to the firstname of the new post's author.