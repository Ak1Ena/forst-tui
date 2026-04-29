export interface Theme {
    name: string;
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    error: string;
    success: string;
    warning: string;
}

export const Themes: Record<string, Theme> = {
    default: {
        name: 'Default (Blue/Gray)',
        primary: 'blue',
        secondary: 'gray',
        accent: 'yellow',
        background: 'black',
        text: 'white',
        error: 'red',
        success: 'green',
        warning: 'yellow'
    },
    nord: {
        name: 'Nord',
        primary: '#81A1C1',
        secondary: '#4C566A',
        accent: '#88C0D0',
        background: '#2E3440',
        text: '#D8DEE9',
        error: '#BF616A',
        success: '#A3BE8C',
        warning: '#EBCB8B'
    },
    dracula: {
        name: 'Dracula',
        primary: '#BD93F9',
        secondary: '#6272A4',
        accent: '#FF79C6',
        background: '#282A36',
        text: '#F8F8F2',
        error: '#FF5555',
        success: '#50FA7B',
        warning: '#F1FA8C'
    },
    monokai: {
        name: 'Monokai',
        primary: '#A6E22E',
        secondary: '#75715E',
        accent: '#F92672',
        background: '#272822',
        text: '#F8F8F2',
        error: '#F92672',
        success: '#A6E22E',
        warning: '#E6DB74'
    }
};
