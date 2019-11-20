
import * as compare from './compare';
import * as prefilter from './prefilter';

let g_imageData: ImageData;

function removeAllElements(className: string) {
    while (true) {
        let elem = document.getElementsByClassName(className)[0]
        if (!elem) {
            break;
        }
        elem.remove();
    }
}

function getInputElement(name: string, index: number = 0) {
    return <HTMLInputElement>document.getElementsByName(name)[index];
}

function getConditionCount() {
    return document.getElementsByName('operator').length;
}

function newElement(tagName: string, params?: {}): HTMLElement {
    let elem = document.createElement(tagName);
    if (params) {
        for (let param in params) {
            elem[param] = params[param];
        }
    }
    return elem;
}

function validateFilename(filename: string) {
    return (
        typeof (filename) === 'string' &&
        filename !== '' &&
        filename !== '.' &&
        filename !== '..' &&
        !filename.match(/[\\\/:,;\*\?"<>\|]/));
}

function updateImages() {
    let src = (<HTMLInputElement>document.getElementsByName('image')[0]).value;
    (<HTMLImageElement>document.getElementById('filter_image')).src = src;
    (<HTMLImageElement>document.getElementById('area_image')).src = src;
    (<HTMLImageElement>document.getElementById('colorpicker_image')).src = src;
    document.getElementById('filter_image').onload = function () {
        g_imageData = compare.getImageData(
            <HTMLImageElement>this,
            document.createElement('canvas')
        );
    }
}

window['loadImage'] = loadImage;
async function loadImage() {
    let file = <File>await new Promise(function (resolve) {
        let input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/bmp,image/jpeg';
        input.onchange = function (event) {
            resolve((<any>event.target).files[0]);
        };
        input.click();
    });
    let data = <string>await new Promise(function (resolve) {
        let reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function () { resolve(<string>reader.result); };
    });
    (<HTMLInputElement>document.getElementsByName('image')[0]).value = data;
    updateImages();
}

window['onFilterSubmit'] = onFilterSubmit;
function onFilterSubmit() {
    if (!validateFilename(getInputElement('folder').value)) {
        window.alert('無効なフォルダー名です');
        return;
    }
    if (!(<HTMLImageElement>document.getElementById('filter_image')).naturalWidth) {
        window.alert('画像が指定されていません');
        return;
    }
    let input = document.createElement('input');
    input.type = 'submit';
    document.getElementById('filter_form').appendChild(input);
    input.click();
    input.remove();
}

/* 領域選択関連 */

let g_selectedCondition = -1;

window['updateCoordinate'] = updateCoordinate;
function updateCoordinate(index: number) {
    if (index < 0) {
        index = getConditionCount();
    }
    if (g_selectedCondition === index) {
        let mask = document.getElementById('area_mask');
        if (g_selectedCondition === getConditionCount()) {
            mask.style.left = getInputElement('ocr_left').value + 'px';
            mask.style.top = getInputElement('ocr_top').value + 'px';
            mask.style.width = getInputElement('ocr_width').value + 'px';
            mask.style.height = getInputElement('ocr_height').value + 'px';
        } else {
            mask.style.left = getInputElement('left', index).value + 'px';
            mask.style.top = getInputElement('top', index).value + 'px';
            mask.style.width = getInputElement('width', index).value + 'px';
            mask.style.height = getInputElement('height', index).value + 'px';
        }
    }
}

function closeAreaWindow() {
    document.getElementById('area_window').style.display = 'none';
    g_selectedCondition = -1;
}

window['selectArea'] = selectArea;
function selectArea(index: number, openAt: HTMLElement) {
    if (index < 0) {
        index = getConditionCount();
    }
    if (g_selectedCondition === index) {
        closeAreaWindow();
        return;
    }
    let rect = openAt.getBoundingClientRect();
    let areaWindow = document.getElementById('area_window');
    areaWindow.style.display = 'block';
    areaWindow.style.top = (window.pageYOffset + rect.bottom) + 'px';
    areaWindow.style.left = (window.pageXOffset + rect.left) + 'px';
    g_selectedCondition = index;
    updateCoordinate(index);
}

window.addEventListener('load', function () {
    updateImages();
    let dragStartX = 0;
    let dragStartY = 0;
    let mouseX = 0;
    let mouseY = 0;
    let dragging = false;
    let areaImage = <HTMLImageElement>document.getElementById('area_image');
    let areaWindow = <HTMLDivElement>document.getElementById('area_window');

    function updateDrag() {
        if (!dragging) {
            return;
        }
        let windowRect = areaWindow.getBoundingClientRect();
        let innerLeft = windowRect.left + areaWindow.clientLeft;
        let innerTop = windowRect.top + areaWindow.clientTop;
        let innerRight = innerLeft + areaWindow.clientWidth;
        let innerBottom = innerTop + areaWindow.clientHeight;
        if (mouseX < innerLeft) {
            areaWindow.scrollLeft -= Math.ceil((innerLeft - mouseX) / 4);
        }
        if (mouseX > innerRight) {
            areaWindow.scrollLeft += Math.ceil((mouseX - innerRight) / 4);
        }
        if (mouseY < innerTop) {
            areaWindow.scrollTop -= Math.ceil((innerTop - mouseY) / 4);
        }
        if (mouseY > innerBottom) {
            areaWindow.scrollTop += Math.ceil((mouseY - innerBottom) / 4);
        }
        let imageRect = areaImage.getBoundingClientRect();
        let left = Math.min(dragStartX, Math.max(0, mouseX - imageRect.left));
        let top = Math.min(dragStartY, Math.max(0, mouseY - imageRect.top));
        let width = Math.max(dragStartX, Math.min(imageRect.width - 1, mouseX - imageRect.left)) - left + 1;
        let height = Math.max(dragStartY, Math.min(imageRect.height - 1, mouseY - imageRect.top)) - top + 1;
        if (g_selectedCondition === getConditionCount()) {
            getInputElement('ocr_left').value = '' + Math.round(left);
            getInputElement('ocr_top').value = '' + Math.round(top);
            getInputElement('ocr_width').value = '' + Math.round(width);
            getInputElement('ocr_height').value = '' + Math.round(height);
        } else {
            getInputElement('left', g_selectedCondition).value = '' + Math.round(left);
            getInputElement('top', g_selectedCondition).value = '' + Math.round(top);
            getInputElement('width', g_selectedCondition).value = '' + Math.round(width);
            getInputElement('height', g_selectedCondition).value = '' + Math.round(height);
        }
        updateCoordinate(g_selectedCondition);
        setTimeout(updateDrag, 20);
    }
    areaImage.ondragstart = function () { return false };
    areaImage.onmousedown = function (ev) {
        if (g_selectedCondition >= 0) {
            if (g_selectedCondition === getConditionCount()) {
                getInputElement('ocr_left').value = '' + ev.offsetX;
                getInputElement('ocr_top').value = '' + ev.offsetY;
                getInputElement('ocr_width').value = '1';
                getInputElement('ocr_height').value = '1';
            } else {
                getInputElement('left', g_selectedCondition).value = '' + ev.offsetX;
                getInputElement('top', g_selectedCondition).value = '' + ev.offsetY;
                getInputElement('width', g_selectedCondition).value = '1';
                getInputElement('height', g_selectedCondition).value = '1';
            }
            dragStartX = ev.offsetX;
            dragStartY = ev.offsetY;
            dragging = true;
            updateDrag();
        }
    };
    document.body.onmouseup = function (ev) {
        dragging = false;
    };
    document.body.addEventListener('mousemove', function (ev) {
        mouseX = ev.clientX;
        mouseY = ev.clientY;
        if (dragging && !(ev.buttons & 1)) {
            dragging = false;
        }
    });
});

/* 文字色選択 */

window['updateColor'] = updateColor;
function updateColor() {
    function toHex8(value: any) {
        let str = '0' + parseInt(value).toString(16);
        return str.substr(str.length - 2);
    }
    let color = '#';
    color += toHex8(getInputElement('ocr_r').value);
    color += toHex8(getInputElement('ocr_g').value);
    color += toHex8(getInputElement('ocr_b').value);
    document.getElementById('colorsample').style.backgroundColor = color;
}

let g_colorpickerShowing = false;

window['getColor'] = getColor;
function getColor(openAt: HTMLElement) {
    let colorpickerWindow = document.getElementById('colorpicker_window');
    if (g_colorpickerShowing) {
        colorpickerWindow.style.display = 'none';
        g_colorpickerShowing = false;
        return;
    }
    let rect = openAt.getBoundingClientRect();
    colorpickerWindow.style.display = 'block';
    colorpickerWindow.style.top = (window.pageYOffset + rect.bottom) + 'px';
    colorpickerWindow.style.left = (window.pageXOffset + rect.left) + 'px';
    g_colorpickerShowing = true;
}

window.addEventListener('load', function () {
    updateColor();
    let colorpickerImage = document.getElementById('colorpicker_image');
    colorpickerImage.onmousemove = function (ev) {
        if (ev.buttons & 1) {
            let index = (Math.round(ev.offsetX) + g_imageData.width * Math.round(ev.offsetY)) * 4;
            getInputElement('ocr_r').value = String(g_imageData.data[index]);
            getInputElement('ocr_g').value = String(g_imageData.data[index + 1]);
            getInputElement('ocr_b').value = String(g_imageData.data[index + 2]);
            updateColor();
        }
    };
    colorpickerImage.onmousedown = colorpickerImage.onmousemove;
    colorpickerImage.ondragstart = function () { return false };
});

/* 条件の追加・削除 */

window['removeCondition'] = removeCondition;
function removeCondition(index: number) {
    closeAreaWindow();
    if (getConditionCount() <= 1) {
        return;
    }
    for (let name of ['left', 'top', 'width', 'height', 'threshold']) {
        let elements = document.getElementsByName(name);
        for (let i = index; i < elements.length - 1; i++) {
            (<HTMLInputElement>elements.item(i)).value = (<HTMLInputElement>elements.item(i + 1)).value;
        }
    }
    let elements = document.getElementsByName('operator');
    for (let i = index; i < elements.length - 1; i++) {
        (<HTMLSelectElement>elements.item(i)).selectedIndex = (<HTMLSelectElement>elements.item(i + 1)).selectedIndex;
    }
    let lastIndex = elements.length - 1;
    removeAllElements('filter_condition' + lastIndex);
}

window['addCondition'] = addCondition;
function addCondition(condition?: any) {
    if (!condition) {
        condition = {};
        condition.left = 0;
        condition.top = 0;
        condition.width = 1;
        condition.height = 1;
        condition.operator = 'rgbmse';
        condition.threshold = 0;
    }
    closeAreaWindow();
    let index = getConditionCount();
    let tbody = <HTMLTableSectionElement>document.getElementById('filter_settings');

    {
        let a = document.createElement('a');
        a.href = 'javascript:void(0);';
        a.onclick = function () { removeCondition(index); };
        a.innerText = '削除';
        let th = document.createElement('th');
        th.appendChild(document.createTextNode('条件 ' + index + ' - '));
        th.appendChild(a);
        th.colSpan = 2;
        let tr = document.createElement('tr');
        tr.className = 'filter_condition' + index;
        tr.appendChild(th);
        tbody.insertBefore(tr, document.getElementById('filter_addcondition'));
    }
    {
        function createNumberInput(name: string, value: any) {
            let input = document.createElement('input');
            input.type = 'number';
            input.name = name;
            input.value = String(value);
            input.oninput = function () { updateCoordinate(index); };
            return input;
        }
        let th = document.createElement('th');
        th.innerText = '比較領域';
        let a = document.createElement('a');
        a.href = 'javascript:void(0);';
        a.onclick = function () { selectArea(index, a); };
        a.innerText = '領域を表示';
        let td = document.createElement('td');
        td.appendChild(document.createTextNode('左上座標: ('));
        td.appendChild(createNumberInput('left', condition.left));
        td.appendChild(document.createTextNode(' , '));
        td.appendChild(createNumberInput('top', condition.top));
        td.appendChild(document.createTextNode(')'));
        td.appendChild(document.createElement('br'));
        td.appendChild(document.createTextNode('サイズ: '));
        td.appendChild(createNumberInput('width', condition.width));
        td.appendChild(document.createTextNode(' x '));
        td.appendChild(createNumberInput('height', condition.height));
        td.appendChild(document.createElement('br'));
        td.appendChild(a);
        let tr = document.createElement('tr');
        tr.className = 'filter_condition' + index;
        tr.appendChild(th);
        tr.appendChild(td);
        tbody.insertBefore(tr, document.getElementById('filter_addcondition'));
    }
    {
        let th = document.createElement('th');
        th.innerText = '演算';
        let select = document.createElement('select');
        select.name = 'operator';
        let options = [
            { value: 'rgbmse', innerText: 'RGB 値の平均二乗誤差がしきい値以下' },
            { value: 'rgbmae', innerText: 'RGB 値の平均絶対誤差がしきい値以下' },
            { value: 'mse', innerText: '輝度の平均二乗誤差がしきい値以下' },
            { value: 'mae', innerText: '輝度の平均絶対誤差がしきい値以下' },
            { value: 'correlation', innerText: '輝度の相関係数の絶対値がしきい値以上' }
        ];
        for (let i = 0; i < options.length; i++) {
            let option = document.createElement('option');
            option.innerText = options[i].innerText;
            option.value = options[i].value;
            select.appendChild(option);
            if (condition.operator === options[i].value) {
                select.selectedIndex = i;
            }
        }
        let td = document.createElement('td');
        td.appendChild(select);
        let tr = document.createElement('tr');
        tr.className = 'filter_condition' + index;
        tr.appendChild(th);
        tr.appendChild(td);
        tbody.insertBefore(tr, document.getElementById('filter_addcondition'));
    }
    {
        let th = document.createElement('th');
        th.innerText = 'しきい値';
        let input = document.createElement('input');
        input.type = 'text';
        input.name = 'threshold';
        input.value = String(condition.threshold);
        input.size = 6;
        let td = document.createElement('td');
        td.appendChild(input);
        let tr = document.createElement('tr');
        tr.className = 'filter_condition' + index;
        tr.appendChild(th);
        tr.appendChild(td);
        tbody.insertBefore(tr, document.getElementById('filter_addcondition'));
    }
}

/* フィルターの動作テスト関連 */

function getJson(path: string) {
    return new Promise<any>(function (resolve) {
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (this.readyState === 4) {
                if (this.response) {
                    resolve(JSON.parse(xhr.responseText));
                }
                else {
                    resolve({});
                }
            }
        };
        xhr.open('get', path, true);
        xhr.send();
    });
}

window['testLoad'] = testLoad;
async function testLoad() {
    closeAreaWindow();
    (<HTMLInputElement>document.getElementById('test_load')).disabled = true;
    (<HTMLInputElement>document.getElementById('test_exec')).disabled = true;
    let image = <HTMLImageElement>document.getElementById('filter_image');
    let height = image.naturalHeight;
    let width = image.naturalWidth;

    removeAllElements('test_row');
    removeAllElements('test_data');

    let count = parseInt((<HTMLInputElement>document.getElementById('test_count')).value);
    let tbody = <HTMLTableSectionElement>document.getElementById('test_tbody');
    let folder = (<HTMLSelectElement>document.getElementById('test_folder')).selectedOptions[0].value;
    let images = await getJson('../images/' + folder + '?type=json');

    let progress = function (n: number) {
        document.getElementById('test_message').innerText =
            '比較対象と同じサイズ (' + width + 'x' + height + ') の画像を探しています (' + n + '/' + images.length + ')';
    };
    progress(0);

    let imageCount = 0;
    let promises = [];
    for (let i = 0; i < images.length; i++) {
        let size = await getJson('../images/' + folder + '/' + images[i] + '?type=json');
        if (size.width === width && size.height === height) {
            let tr = document.createElement('tr');
            tr.className = 'test_row';
            let th = document.createElement('th');
            let img = document.createElement('img');
            promises.push(new Promise(function (resolve) {
                img.onload = function () { resolve(); };
            }));
            img.src = '../images/' + folder + '/' + images[i];
            img.style.maxWidth = '160px';
            img.style.maxHeight = '160px';
            img.className = 'test_image';
            let a = document.createElement('a');
            a.href = img.src;
            a.target = '_blank';
            a.appendChild(img);
            th.appendChild(a);
            tr.appendChild(th);
            tbody.appendChild(tr);
            imageCount++;
            if (imageCount === count) {
                break;
            }
        }
        progress(i);
    }
    await Promise.all(promises);
    (<HTMLInputElement>document.getElementById('test_load')).disabled = false;
    if (imageCount > 0) {
        (<HTMLInputElement>document.getElementById('test_exec')).disabled = false;
    }
    document.getElementById('test_message').innerText = 'ロード完了';
}

let g_worker;

window['testExec'] = testExec;
async function testExec() {
    closeAreaWindow();
    (<HTMLInputElement>document.getElementById('test_load')).disabled = true;
    (<HTMLInputElement>document.getElementById('test_exec')).disabled = true;

    let ocrEnabled = getInputElement('ocr_enabled').checked;

    removeAllElements('test_data');

    let model = g_imageData;
    let images = document.getElementsByClassName('test_image');
    let rows = document.getElementsByClassName('test_row');
    let conditionCount = getConditionCount();
    let thead = document.getElementById('test_thead');
    for (let c = 0; c < conditionCount; c++) {
        let th = document.createElement('th');
        th.innerText = '条件 ' + c;
        th.className = 'test_data';
        thead.firstChild.appendChild(th);
    }
    let ocrOptions: prefilter.PrefilterOptions = {
        textColor: {
            r: parseInt(getInputElement('ocr_r').value),
            g: parseInt(getInputElement('ocr_g').value),
            b: parseInt(getInputElement('ocr_b').value)
        },
        space: <any>(<HTMLSelectElement>document.getElementsByName('ocr_space')[0]).value,
        distance: Number(getInputElement('ocr_threshold').value)
    };
    if (ocrEnabled) {
        let th = document.createElement('th');
        th.innerText = 'プレフィルター・文字認識結果';
        th.className = 'test_data';
        thead.firstChild.appendChild(th);

        document.getElementById('test_message').innerText = '文字認識エンジン初期化中';

        if (!g_worker) {
            g_worker = window['Tesseract'].createWorker();
            await g_worker.load();
            await g_worker.loadLanguage('jpn');
            await g_worker.initialize('jpn');
        }
    }
    document.getElementById('test_message').innerText = '計算中';

    for (let i = 0; i < images.length; i++) {
        let data = compare.getImageData(<HTMLImageElement>images[i], document.createElement('canvas'));
        for (let c = 0; c < conditionCount; c++) {
            let td = document.createElement('td');
            let area = {
                left: parseInt(getInputElement('left', c).value),
                top: parseInt(getInputElement('top', c).value),
                width: parseInt(getInputElement('width', c).value),
                height: parseInt(getInputElement('height', c).value)
            };
            let select = (<HTMLSelectElement>document.getElementsByName('operator')[c]);
            let operator = select.selectedOptions[0].value;
            let value =
                operator === 'rgbmse' ? compare.calculateRgbmse(data, model, area) :
                operator === 'rgbmae' ? compare.calculateRgbmae(data, model, area) :
                operator === 'mse' ? compare.calculateMse(data, model, area) :
                operator === 'mae' ? compare.calculateMae(data, model, area) :
                operator === 'correlation' ? compare.calculateCorrelation(data, model, area) :
                0;
            let div = document.createElement('div');
            div.style.width = area.width + 'px';
            div.style.height = area.height + 'px';
            div.style.overflow = 'hidden';
            let img = document.createElement('img');
            img.src = (<HTMLImageElement>images[i]).src;
            img.style.left = '-' + area.left + 'px';
            img.style.top = '-' + area.top + 'px';
            img.style.position = 'relative';
            div.appendChild(img);
            td.appendChild(div);
            td.appendChild(document.createElement('br'));
            td.appendChild(document.createTextNode(String(value)))
            td.className = 'test_data';

            let threshold = Number(getInputElement('threshold', c).value);
            if (operator === 'correlation') {
                if (Math.abs(value) >= threshold) {
                    td.classList.add('test_match');
                }
            } else {
                if (value <= threshold) {
                    td.classList.add('test_match');
                }
            }
            rows[i].appendChild(td);
            await new Promise(function (resolve) { setTimeout(resolve, 1); });
        }
        if (ocrEnabled) {
            let canvas = document.createElement('canvas');
            let td = document.createElement('td');
            td.appendChild(canvas);
            td.className = 'test_data';
            rows[i].appendChild(td);

            let area = {
                left: parseInt(getInputElement('ocr_left').value),
                top: parseInt(getInputElement('ocr_top').value),
                width: parseInt(getInputElement('ocr_width').value),
                height: parseInt(getInputElement('ocr_height').value)
            };
            prefilter.prefilter(canvas, data, area, ocrOptions);
            let result = await g_worker.recognize(canvas);
            td.appendChild(document.createElement('br'));
            td.appendChild(document.createTextNode((<string>result.data.text).replace(/ /g, '')));
        }
    }
    
    document.getElementById('test_message').innerText = '計算完了';
    (<HTMLInputElement>document.getElementById('test_load')).disabled = false;
    (<HTMLInputElement>document.getElementById('test_exec')).disabled = false;
}

