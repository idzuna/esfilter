
window['initializetext'] = initializetext;
function initializetext(text: string) {
    if (navigator.userAgent.indexOf('iPhone') > 0 ||
        navigator.userAgent.indexOf('iPad') > 0 ||
        navigator.userAgent.indexOf('iPod') > 0 ||
        navigator.userAgent.indexOf('Android') > 0
    ) {
        let textarea = document.createElement('textarea');
        textarea.name = 'text';
        textarea.rows = 5;
        textarea.innerText = text;
        document.getElementById('edit').appendChild(textarea);
        textarea.focus();
    } else {
        let input = document.createElement('input');
        input.name = 'text';
        input.value = text;
        document.getElementById('edit').appendChild(input);
        input.focus();
    }
    window.scrollTo(0, 10000);
}
