
import { post } from './post';
window['post'] = post;

function findCheckedFilter() {
    let elements = <NodeListOf<HTMLInputElement>>document.getElementsByName('filter');
    for (let elem of elements) {
        if (elem.checked) {
            return elem.value;
        }
    }
    return null;
}

function exists(filter: string) {
    let elements = <NodeListOf<HTMLInputElement>>document.getElementsByName('filter');
    for (let elem of elements) {
        if (elem.value === filter) {
            return true;
        }
    }
    return false;
}

function validateFilename(filename: string) {
    return (
        typeof (filename) === 'string' &&
        filename !== '' &&
        filename !== '.' &&
        filename !== '..' &&
        !filename.match(/[\\\/:,;\*\?"<>\|]/));
}

window['create'] = create;
function create() {
    let name = window.prompt('フィルター名を入力してください', '');
    if (!name) {
        return;
    }
    if (!validateFilename(name)) {
        window.alert('無効なフィルター名です');
        return;
    }
    if (exists(name)) {
        window.alert('フィルター名が重複しています')
        return;
    }
    document.cookie = 'selected=' + name;
    post('filters/create', { filter: name });
}

window['run'] = run;
function run() {
    let filter = findCheckedFilter();
    if (filter) {
        if (window.confirm('フィルター "' + filter + '" を単独実行してよろしいですか？')) {
            post('filters/' + filter + '/run')
        }
    }
}

function defineEndpoint(name: string) {
    window[name] = () => {
        let filter = findCheckedFilter();
        if (filter) {
            post('filters/' + filter + '/' + name);
        }
    };
}
defineEndpoint('enable');
defineEndpoint('disable');
defineEndpoint('up');
defineEndpoint('down');
defineEndpoint('upmost');
defineEndpoint('downmost');

window['rename'] = rename;
function rename(copy?: boolean) {
    let filter = findCheckedFilter();
    if (filter) {
        let name = window.prompt('フィルター名を入力してください', filter);
        if (!name || name === filter) {
            return;
        }
        if (!validateFilename(name)) {
            window.alert('無効なフィルター名です');
            return;
        }
        if (exists(name)) {
            window.alert('フィルター名が重複しています');
            return;
        }
        document.cookie = 'selected=' + name;
        post('filters/' + filter + '/' + (copy ? 'copy' : 'rename') + '?newname=' + name);
    }
}

window['remove'] = remove;
function remove() {
    let filter = findCheckedFilter();
    if (filter) {
        if (window.confirm('フィルター "' + filter + '" を削除してよろしいですか？')) {
            post('filters/' + filter + '/remove');
        }
    }
}

window['selectDefault'] = selectDefault;
function selectDefault() {
    let filter = '';
    for (let pair of document.cookie.split(';')) {
        if (pair.startsWith('selected=')) {
            filter = pair.replace(/^selected=/, '');
            break;
        }
    }
    let elements = <NodeListOf<HTMLInputElement>>document.getElementsByName('filter');
    for (let elem of elements) {
        if (elem.value === filter) {
            elem.checked = true;
            elem.parentElement.parentElement.className = 'selected';
            break;
        }
    }
}

window['onradiochange'] = onradiochange;
function onradiochange() {
    let elements = <NodeListOf<HTMLInputElement>>document.getElementsByName('filter');
    for (let elem of elements) {
        if (elem.checked) {
            document.cookie = 'selected=' + elem.value;
            elem.parentElement.parentElement.className = 'selected';
        } else {
            elem.parentElement.parentElement.className = '';
        }
    }
}