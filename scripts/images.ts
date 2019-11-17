
import { post } from './post';

window['sendback'] = sendback;
function sendback(folder: string, filename: string) {
    if (window.confirm(filename + ' を未分類へ戻します。文字認識結果も削除されますがよろしいですか？')) {
        post(folder + '/' + filename + '/revert');
    }
}
