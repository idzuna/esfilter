
export function post(action: string, parameters?: any) {
    let form = document.createElement('form');
    form.action = action;
    form.method = 'post';
    if (parameters) {
        for (let key in parameters) {
            let input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = parameters[key];
            form.appendChild(input);
        }
    }
    document.body.appendChild(form);
    form.submit();
}
