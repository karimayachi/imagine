import { observable, bind } from '../src/index';
import '@material/mwc-button';
import '@material/mwc-icon-button';
import '@material/mwc-icon';
import '@material/mwc-fab';
import '@material/mwc-select';
import '@material/mwc-slider';
import '@material/mwc-textfield';
import '@material/mwc-list/mwc-list';
import '@material/mwc-list/mwc-list-item';
import { observe } from 'mobx';

class PeopleViewModel {
    @observable html: string;
    @observable people: Person[];
    @observable selectedPerson: Person;

    constructor() {
        this.html = '';
        this.people = [new Person('Karim', 'Ayachi', 1), new Person('John', 'Doe', 2)];
        this.selectedPerson = this.people[1];
    }

    add = (): void => {
        let newPerson: Person = new Person('', '', this.people.length + 1);
        this.people.push(newPerson);
        this.selectedPerson = newPerson;
    };

    delete = (person: Person): void => {
        this.people.remove(person);
    }
}

class Person {
    @observable id: number;
    @observable firstname: string;
    @observable lastname: string;
    @observable retired: boolean;

    constructor(firstname: string, lastname: string, id: number) {
        this.firstname = firstname;
        this.lastname = lastname;
        this.id = id;
        this.retired = false;
    }
}

class MainViewModel {
    @observable name: string;
    @observable age: number;
    @observable genres: string[];
    @observable isDraggable: boolean;
    @observable happyIcon: string;
    @observable selectedVM?: PeopleViewModel;

    constructor() {
        this.name = 'Karim';
        this.age = 41;
        this.genres = ['Hip Hop'];
        this.isDraggable = true;
        this.happyIcon = 'edit';
    }

    reset = (): void => {
        this.name = 'Karim';
        this.age = 41;
        this.isDraggable = false;
        this.happyIcon = 'shopping_cart';
    }

    showPeopleView = (): void => {
        this.selectedVM = new PeopleViewModel();

        fetch(`./views/demo2.html`).then((response: Response): void => {
            response.text().then((text: string): void => {
                this.selectedVM!.html = text;
            });
        });
    }

    addGenre = (): void => {
        const genres: string[] = ['Hip Hop', 'Reggae', 'Punk', '80s', 'Pop'];
        this.genres.push(genres[Math.floor(Math.random() * genres.length)]);
    }

    deleteGenre = (genre: string): void => {
        this.genres.remove(genre);
    }
}

bind(document.getElementById('bindthis'), new MainViewModel());