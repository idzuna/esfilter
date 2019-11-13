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

window['post'] = post;
function post(action: string) {
    let form = document.createElement('form');
    form.action = action;
    form.method = 'post';
    document.body.appendChild(form);
    form.submit();
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

window['enable'] = enable;
function enable() {
    let filter = findCheckedFilter();
    if (filter) {
        post('filters/' + filter + '/enable');
    }
}

window['disable'] = disable;
function disable() {
    let filter = findCheckedFilter();
    if (filter) {
        post('filters/' + filter + '/disable');
    }
}

window['up'] = up;
function up() {
    let filter = findCheckedFilter();
    if (filter) {
        post('filters/' + filter + '/up');
    }
}

window['down'] = down;
function down() {
    let filter = findCheckedFilter();
    if (filter) {
        post('filters/' + filter + '/down');
    }
}

window['newfilter'] = newfilter;
function newfilter() {
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
    post('filters/' + name + '/newfilter');
}

window['rename'] = rename;
function rename() {
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
        post('filters/' + filter + '/rename?newname=' + name);
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