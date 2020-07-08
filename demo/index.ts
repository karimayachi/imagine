import { observable, bind } from '../src/index';
import '@material/mwc-button';
import '@material/mwc-icon';
import '@material/mwc-fab';
import '@material/mwc-slider';
import '@material/mwc-textfield';
import '@material/mwc-list/mwc-list';
import '@material/mwc-list/mwc-list-item';

class ViewModel {
    @observable name: string;
    @observable age: number;
    @observable genres: string[];
    @observable isDraggable: boolean;
    @observable happyIcon: string;

    constructor() {
        this.name = 'Karim';
        this.age = 41;
        this.genres = ['Hip Hop'];
        this.isDraggable = true;
        this.happyIcon = "edit";
    }

    reset = (): void => {
        this.name = 'Karim';
        this.age = 41;
        this.isDraggable = false;
        this.happyIcon = "shopping_cart";
    }

    addGenre = (): void => {
        const genres: string[] = ['Hip Hop', 'Reggae', 'Punk', '80s', 'Pop'];
        this.genres.push(genres[Math.floor(Math.random() * genres.length)]);
    }

    deleteGenre = (genre: string): void => {
        this.genres.remove(genre);
    }
}

bind(document.getElementById('bindthis'), new ViewModel());