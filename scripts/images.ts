
import { post } from './post';

window['sendback'] = sendback;
function sendback(folder: string, filename: string, options?: any) {
    if (window.confirm(filename + ' の認識結果を削除して未分類へ戻します。よろしいですか？')) {
        post(folder + '/' + filename + '/revert', options);
    }
}
