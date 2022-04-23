# Scopes

Both the Compostion- and the MVVM pattern aim for losely coupled parts. Wether those parts are Components or ViewModels, they shouldn't depend on other Components or ViewModels. Also Views shouldn't depend on ViewModels.
This makes a lot of sense for components when talking about isolated, reuseable components. For instance UI-components (formfields, etc). These components are shared between applications and reused many times within an application. They provide standard functionality that will behave more or less the same in all situations. If they need to have any form of customizibility or interaction with the rest of the application, that can be interfaced with through exposed properties and methods.

Components are great for these types of situations. However, if you move away from these use cases to more abstract business logic, two things happen:
- More and more things depend on or affect other things
- Things are becoming more specific to the application and less reusable

As an example, it is far from uncommon for something as general as wether a user is logged in to affect every aspect of the application.