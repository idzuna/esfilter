﻿
import express = require('express');
import path = require('path');
import net = require('net');
import fs = require('fs');
import zlib = require('zlib');
import bodyParser = require('body-parser');
import canvas = require('canvas');
import tesseract = require('tesseract.js');
import * as compare from './scripts/compare';
import * as prefilter from './scripts/prefilter';
import * as textdb from './textdb';

class MetaData {
    width: number;
    height: number;
    filter: string;
    text: string;
};
class Config {
    basepath: string;
    tessdatadir: string;
    defaulttraineddata: string;
    thumbdir: string;
    imagedir: string;
    presetdir: string;
    unclassifieddir: string;
    unmatcheddir: string;
    validextensions: string[];
    conversiontable: { [key: string]: string };
};
class Condition {
    left: number;
    top: number;
    width: number;
    height: number;
    operator: string;
    threshold: number;
};
class Filter {
    name: string;
    folder: string;
    enabled: boolean;
    conditions: Condition[];
    ocrEnabled: boolean;
    ocrLeft: number;
    ocrTop: number;
    ocrWidth: number;
    ocrHeight: number;
    ocrR: number;
    ocrG: number;
    ocrB: number;
    ocrSpace: string;
    ocrThreshold: number;
    ocrTrainedData: string;
    ocrFills: boolean;
};
class Settings {
    autofilterenabled: boolean;
    imagesPerPage: number;
    enableFuzzySearch: boolean;
    filters: Filter[];
};

let g_log = <string[]>[];
let g_busy = false;

let g_config: Config;
let g_settings: Settings;
let g_workers: { [key: string]: tesseract.Worker };
let g_ocrWorkerInitialized: Promise<void>;

function formatDate(date: Date) {
    let dateString = '';
    dateString += date.getFullYear();
    dateString += '/' + ('0' + (date.getMonth() + 1)).substr(-2);
    dateString += '/' + ('0' + date.getDate()).substr(-2);
    dateString += ' ' + ('0' + date.getHours()).substr(-2);
    dateString += ':' + ('0' + date.getMinutes()).substr(-2);
    dateString += ':' + ('0' + date.getSeconds()).substr(-2);
    return dateString;
}

function info(message: string) {
    let date = formatDate(new Date());
    console.log(date + ' ' + message);
    g_log.push(date + ' ' + message);
}

function saveSettings() {
    fs.writeFile('settings.json', JSON.stringify(g_settings), function () { });
}

function findFilter(name: string) {
    for (let i = 0; i < g_settings.filters.length; i++) {
        if (g_settings.filters[i].name === name) {
            return i;
        }
    }
    return -1;
}

async function ignoreError(promise: Promise<any>) {
    try {
        return await promise;
    } catch (e) {
        return null;
    }
}

async function listFiles(p: fs.PathLike, listDirectories?: boolean): Promise<string[]> {
    let files = <string[]>[];
    try {
        let dir = await fs.promises.readdir(p, { withFileTypes: true });
        for (let entry of dir) {
            if (listDirectories) {
                if (entry.isDirectory()) {
                    files.push(entry.name);
                }
            }
            else {
                if (entry.isFile()) {
                    files.push(entry.name);
                }
            }
        }
    }
    catch (e) {
    }
    return files;
}

function listDirectories(p: fs.PathLike) {
    return listFiles(p, true);
}

function validateExtension(file: string) {
    let name = file.toLowerCase();
    for (let ext of g_config.validextensions) {
        if (name.endsWith(ext)) {
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

function evaluateCondition(conditions: Condition[], filterImage: ImageData, image: ImageData) {
    if (filterImage.width !== image.width || filterImage.height !== image.height) {
        return false;
    }
    for (let condition of conditions) {
        let value =
            condition.operator === 'rgbmse' ? compare.calculateRgbmse(image, filterImage, condition) :
            condition.operator === 'rgbmae' ? compare.calculateRgbmae(image, filterImage, condition) :
            condition.operator === 'mse' ? compare.calculateMse(image, filterImage, condition) :
            condition.operator === 'mae' ? compare.calculateMae(image, filterImage, condition) :
            condition.operator === 'correlation' ? compare.calculateCorrelation(image, filterImage, condition) :
            0;
        if (condition.operator === 'correlation') {
            if (Math.abs(value) < condition.threshold) {
                return false;
            }
        } else {
            if (value > condition.threshold) {
                return false;
            }
        }
    }
    return true;
}

async function loadImageData(filename: string) {
    let file = await fs.promises.readFile(filename);
    let image = await canvas.loadImage(file);
    return compare.getImageData(
        <HTMLImageElement><any>image,
        <HTMLCanvasElement><any>canvas.createCanvas(1, 1)
    );
}

async function getImageDimension(filename: string) {
    let file = await fs.promises.readFile(filename);
    let image = await canvas.loadImage(file);
    return { width: image.naturalWidth, height: image.naturalHeight };
}

async function resize(input: string, output: string, width: number, height: number) {
    let data = await fs.promises.readFile(input);
    let image = await canvas.loadImage(data);
    let scale = 256 / Math.max(image.naturalWidth, image.naturalHeight);
    let c = canvas.createCanvas(image.naturalWidth * scale, image.naturalHeight * scale);
    let ctx = c.getContext('2d');
    ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, c.width, c.height);

    let out = fs.createWriteStream(output);
    let promise = new Promise(function (resolve, reject) {
        out.on('finish', resolve);
        out.on('error', reject);
    });
    c.createPNGStream().pipe(out);
    await promise;
}

async function initializeOcrWorker()
{
    let gzip = function (buffer) {
        return new Promise<Buffer>(function (resolve, reject) {
            zlib.gzip(buffer, function (error, result) {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        })
    };
    let unzip = function (buffer) {
        return new Promise<Buffer>(function (resolve, reject) {
            zlib.unzip(buffer, function (error, result) {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        })
    };
    g_workers = {};
    const files = await fs.promises.readdir(g_config.tessdatadir);
    for (const file of files) {
        if (file.endsWith('.traineddata')) {
            if (!files.includes(file + '.gz')) {
                let content = await fs.promises.readFile(g_config.tessdatadir + '/' + file);
                let compressed = await gzip(content);
                fs.promises.writeFile(g_config.tessdatadir + '/' + file + '.gz', compressed);
            }
            let prefix = file.replace(/\.traineddata$/, '');
            let worker = tesseract.createWorker({ 'langPath': g_config.tessdatadir });
            await worker.load();
            await worker.loadLanguage(prefix);
            await worker.initialize(prefix);
            g_workers[prefix] = worker;
        }
        if (file.endsWith('.traineddata.gz')) {
            if (!files.includes(file.replace(/\.gz$/, ''))) {
                let content = await fs.promises.readFile(g_config.tessdatadir + '/' + file);
                let decompressed = await unzip(content);
                fs.promises.writeFile(g_config.tessdatadir + '/' + file.replace(/\.gz$/, ''), decompressed);
                let prefix = file.replace(/\.traineddata\.gz$/, '');
                let worker = tesseract.createWorker({ 'langPath': g_config.tessdatadir });
                await worker.load();
                await worker.loadLanguage(prefix);
                await worker.initialize(prefix);
                g_workers[prefix] = worker;
            }
        }
    }
    info('文字認識エンジンの初期化が完了しました');
}

async function runOcr(image: ImageData, filter: Filter, resultFile: string) {
    let c = canvas.createCanvas(filter.ocrWidth, filter.ocrHeight);
    let area = {
        top: filter.ocrTop,
        left: filter.ocrLeft,
        width: filter.ocrWidth,
        height: filter.ocrHeight
    };
    let options: prefilter.PrefilterOptions = {
        textColor: { r: filter.ocrR, g: filter.ocrG, b: filter.ocrB },
        space: <any>filter.ocrSpace,
        distance: filter.ocrThreshold,
        fills: filter.ocrFills
    };
    prefilter.prefilter(<any>c, image, area, options);
    let out = fs.createWriteStream('ocrtemp.png');
    let promise = new Promise(function (resolve, reject) {
        out.on('finish', resolve);
        out.on('error', reject);
    });
    c.createPNGStream().pipe(out);
    await promise;
    let result = await g_workers[filter.ocrTrainedData].recognize('ocrtemp.png');
    return result.data.text.replace(/\s/g, '');
}

async function execFilter(
    filter: Filter,
    filterImage: ImageData,
    file: string,
    image: ImageData
) {
    if (evaluateCondition(filter.conditions, filterImage, image)) {
        (async function () {
            await ignoreError(fs.promises.mkdir(path.join(g_config.thumbdir, filter.folder), { recursive: true }));
            await ignoreError(fs.promises.rename(
                path.join(g_config.thumbdir, g_config.unclassifieddir, file + '.png'),
                path.join(g_config.thumbdir, filter.folder, file + '.png')
            ));
        })();
        await ignoreError(fs.promises.mkdir(path.join(g_config.imagedir, filter.folder), { recursive: true }));
        await fs.promises.rename(
            path.join(g_config.imagedir, g_config.unclassifieddir, file),
            path.join(g_config.imagedir, filter.folder, file)
        );
        info(file + ' はフィルター "' + filter.name + '" によって振り分けられました');
        let ocrText = '';
        if (filter.ocrEnabled) {
            try {
                await g_ocrWorkerInitialized;
                ocrText = await runOcr(image, filter, path.join(g_config.imagedir, filter.folder, file + '.txt'));
                info(file + ' の文字認識が完了しました');
            } catch (e) {
                info(file + ' の文字認識に失敗しました');
            }
        }
        let meta: MetaData = {
            width: image.width,
            height: image.height,
            filter: filter.name,
            text: ocrText
        };
        await fs.promises.writeFile(
            path.join(g_config.imagedir, filter.folder, file + '.json'),
            JSON.stringify(meta)
        );
        await textdb.set(filter.folder, file, ocrText);
        return true;
    } else {
        return false;
    }
}

async function runSingleFilter(filter: Filter) {
    if (g_busy) {
        return false;
    }
    g_busy = true;
    try {
        let filterImage = await loadImageData(path.join(g_config.presetdir, filter.name));
        let files = await listFiles(path.join(g_config.imagedir, g_config.unclassifieddir));
        let imageFiles = files.filter(validateExtension);
        for (let file of imageFiles) {
            try {
                let filename = path.join(g_config.imagedir, g_config.unclassifieddir, file);
                let image = await loadImageData(filename);
                if (!await execFilter(filter, filterImage, file, image)) {
                    info(file + ' はフィルターされませんでした');
                }
            } catch (e) {
                info(file + ' の処理に失敗しました');
            }
        }
    } catch (e) {
    }
    g_busy = false;
    return true;
}

async function runFilters() {
    if (g_busy) {
        return false;
    }
    g_busy = true;
    try {
        let validFilters = <{ image: ImageData, filter: Filter }[]>[];
        for (let filter of g_settings.filters) {
            if (!filter.enabled) {
                continue;
            }
            try {
                let filterImage = await loadImageData(path.join(g_config.presetdir, filter.name));
                validFilters.push({
                    image: filterImage,
                    filter: filter
                });
            } catch (e) {
                info('フィルター "' + filter.name + '" の比較画像を読み込めませんでした');
            }
        }
        let files = await listFiles(path.join(g_config.imagedir, g_config.unclassifieddir));
        let imageFiles = files.filter(validateExtension);
        for (let file of imageFiles) {
            try {
                let filename = path.join(g_config.imagedir, g_config.unclassifieddir, file);
                let image = await loadImageData(filename);
                let filtered = false;
                for (let filter of validFilters) {
                    if (await execFilter(filter.filter, filter.image, file, image)) {
                        filtered = true;
                        break;
                    }
                }
                if (!filtered) {
                    (async function () {
                        await ignoreError(fs.promises.mkdir(path.join(g_config.thumbdir, g_config.unmatcheddir), { recursive: true }));
                        await ignoreError(fs.promises.rename(
                            path.join(g_config.thumbdir, g_config.unclassifieddir, file + '.png'),
                            path.join(g_config.thumbdir, g_config.unmatcheddir, file + '.png')
                        ));
                    })();
                    await ignoreError(fs.promises.mkdir(path.join(g_config.imagedir, g_config.unmatcheddir), { recursive: true }));
                    await fs.promises.rename(
                        filename,
                        path.join(g_config.imagedir, g_config.unmatcheddir, file)
                    );
                    info(file + ' は ' + g_config.unmatcheddir + ' へ移動されました');
                    let meta: MetaData = {
                        width: image.width,
                        height: image.height,
                        filter: '',
                        text: ''
                    };
                    await fs.promises.writeFile(
                        path.join(g_config.imagedir, g_config.unmatcheddir, file + '.json'),
                        JSON.stringify(meta)
                    );
                }
            } catch (e) {
                info(file + ' の処理に失敗しました');
            }
        }
    } catch (e) {
    }
    g_busy = false;
    return true;
}

function beginWorker() {
    (async function () {
        while (true) {
            if (g_settings.autofilterenabled) {
                try {
                    let files = await listFiles(path.join(g_config.imagedir, g_config.unclassifieddir));
                    let imageFiles = files.filter(validateExtension);
                    if (imageFiles.length > 0) {
                        await runFilters();
                    }
                } catch (e) {
                }
            }
            await new Promise(function (resolve) { setTimeout(resolve, 1000); });
        }
    })();
}

async function revertFile(folder: string, file: string) {
    (async function () {
        await ignoreError(fs.promises.mkdir(path.join(g_config.thumbdir, g_config.unclassifieddir), { recursive: true }));
        await ignoreError(fs.promises.rename(
            path.join(g_config.thumbdir, folder, file + '.png'),
            path.join(g_config.thumbdir, g_config.unclassifieddir, file + '.png')
        ));
    })();
    let src = path.join(g_config.imagedir, folder, file);
    let dest = path.join(g_config.imagedir, g_config.unclassifieddir, file);
    await ignoreError(fs.promises.mkdir(path.join(g_config.imagedir, g_config.unclassifieddir), { recursive: true }));
    await ignoreError(fs.promises.rename(src, dest));
    await ignoreError(fs.promises.unlink(src + '.json'));
    await textdb.remove(folder, file);
}

function startExpress() {

    let router = express.Router();

    router.use(bodyParser.urlencoded({ extended: true, limit: 100 * 1024 * 1024 }));

    router.get('/', async function (req, res) {
        let folders = await listDirectories(g_config.imagedir);
        res.render('index', {
            param: {
                isAutoFilterEnabled: g_settings.autofilterenabled,
                folders: folders,
                log: g_log
            }
        });
    });

    router.post('/autofilter/enable', function (req, res) {
        if (!g_settings.autofilterenabled) {
            info('フィルターの自動実行を開始します');
            g_settings.autofilterenabled = true;
            saveSettings();
        }
        res.redirect(g_config.basepath + '/filters');
    });

    router.post('/autofilter/disable', function (req, res) {
        if (g_settings.autofilterenabled) {
            info('フィルターの自動実行を停止します');
            g_settings.autofilterenabled = false;
            saveSettings();
        }
        res.redirect(g_config.basepath + '/filters');
    });

    router.post('/autofilter/once', function (req, res) {
        if (g_settings.autofilterenabled) {
            res.redirect(g_config.basepath + '/filters?status=error');
            return;
        }
        (async function () {
            info('フィルターの単発実行を開始します');
            if (await runFilters()) {
                info('フィルターの単発実行を完了しました');
            } else {
                info('他のジョブが実行中のためフィルターの単発実行を中止しました');
            }
        })();
        res.redirect(g_config.basepath + '/filters');
    });

    router.get('/filters', function (req, res) {
        res.render('filters', {
            param: {
                filters: g_settings.filters,
                isAutoFilterEnabled: g_settings.autofilterenabled,
                status: req.query.status,
                log: g_log
            }
        });
    });

    router.post('/filters/create', async function (req, res) {
        let filter = req.body.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index >= 0) {
            res.redirect(g_config.basepath + '/filters?status=error');
            return;
        }
        g_settings.filters.push({
            name: filter,
            folder: '新しいフォルダー',
            enabled: false,
            conditions: [{
                left: 0,
                top: 0,
                width: 1,
                height: 1,
                operator: 'rgbmse',
                threshold: 0
            }],
            ocrEnabled: false,
            ocrLeft: 0,
            ocrTop: 0,
            ocrWidth: 1,
            ocrHeight: 1,
            ocrR: 255,
            ocrG: 255,
            ocrB: 255,
            ocrSpace: 'rgb',
            ocrThreshold: 10,
            ocrTrainedData: g_config.defaulttraineddata,
            ocrFills: false
        });
        saveSettings();
        res.redirect(g_config.basepath + '/filters/' + filter);
        return;
    });

    router.get('/filters/:filter', async function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        let image = '';
        let mime = '';
        try {
            image = await fs.promises.readFile(path.join(g_config.presetdir, filter), 'base64');
            if (image.substr(0, 2) === 'Qk') {
                mime = 'data:image/bmp;base64,';
            } else if (image.substr(0, 2) === '/9') {
                mime = 'data:image/jpeg;base64,';
            } else if (image.substr(0, 5) === 'iVBOR') {
                mime = 'data:image/png;base64,';
            } else {
                mime = 'data:image/unknown;base64,';
            }
        }
        catch (e) {
        }
        res.render('filter', {
            param: {
                filter: g_settings.filters[index],
                image: mime + image,
                folders: await listDirectories(g_config.imagedir),
                trainedData: Object.keys(g_workers)
            }
        });
    });

    router.post('/filters/:filter/run', function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        (async function () {
            info('フィルター "' + filter + '" の単独実行を開始します');
            if (await runSingleFilter(g_settings.filters[index])) {
                info('フィルター "' + filter + '" の単独実行を完了しました');
            } else {
                info('他のジョブが実行中のためフィルター "' + filter + '" の単独実行を中止しました');
            }
        })();
        res.redirect(g_config.basepath + '/filters');
    });

    router.post('/filters/:filter/enable', function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        g_settings.filters[index].enabled = true;
        saveSettings();
        res.redirect(g_config.basepath + '/filters');
    });

    router.post('/filters/:filter/disable', function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        g_settings.filters[index].enabled = false;
        saveSettings();
        res.redirect(g_config.basepath + '/filters');
    });

    router.post('/filters/:filter/up', function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        if (index > 0) {
            let tmp = g_settings.filters[index];
            g_settings.filters[index] = g_settings.filters[index - 1];
            g_settings.filters[index - 1] = tmp;
            saveSettings();
        }
        res.redirect(g_config.basepath + '/filters');
    });

    router.post('/filters/:filter/down', function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        if (index + 1 < g_settings.filters.length) {
            let tmp = g_settings.filters[index];
            g_settings.filters[index] = g_settings.filters[index + 1];
            g_settings.filters[index + 1] = tmp;
            saveSettings();
        }
        res.redirect(g_config.basepath + '/filters');
    });

    router.post('/filters/:filter/upmost', function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        if (index > 0) {
            let tmp = g_settings.filters[index];
            g_settings.filters.splice(index, 1);
            g_settings.filters.unshift(tmp);
            saveSettings();
        }
        res.redirect(g_config.basepath + '/filters');
    });

    router.post('/filters/:filter/downmost', function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        if (index + 1 < g_settings.filters.length) {
            let tmp = g_settings.filters[index];
            g_settings.filters.splice(index, 1);
            g_settings.filters.push(tmp);
            saveSettings();
        }
        res.redirect(g_config.basepath + '/filters');
    });

    router.post('/filters/:filter/rename', async function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        let newname = req.query.newname;
        if (typeof newname !== 'string') {
            res.redirect(g_config.basepath + '/filters?status=error');
            return;
        }
        let newindex = findFilter(newname);
        if (!validateFilename(newname) || newindex >= 0) {
            res.redirect(g_config.basepath + '/filters?status=error');
            return;
        }
        await ignoreError(fs.promises.rename(
            path.join(g_config.presetdir, filter),
            path.join(g_config.presetdir, newname)
        ));
        g_settings.filters[index].name = newname;
        saveSettings();
        res.redirect(g_config.basepath + '/filters');
        return;
    });

    router.post('/filters/:filter/copy', async function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        let newname = req.query.newname;
        if (typeof newname !== 'string') {
            res.redirect(g_config.basepath + '/filters?status=error');
            return;
        }
        let newindex = findFilter(newname);
        if (!validateFilename(newname) || newindex >= 0) {
            res.redirect(g_config.basepath + '/filters?status=error');
            return;
        }
        await ignoreError(fs.promises.copyFile(
            path.join(g_config.presetdir, filter),
            path.join(g_config.presetdir, newname)
        ));
        let original = g_settings.filters[index];
        let newfilter: Filter = {
            name: newname,
            folder: original.folder,
            enabled: original.enabled,
            conditions: [],
            ocrEnabled: original.ocrEnabled,
            ocrLeft: original.ocrLeft,
            ocrTop: original.ocrTop,
            ocrWidth: original.ocrWidth,
            ocrHeight: original.ocrHeight,
            ocrR: original.ocrR,
            ocrG: original.ocrG,
            ocrB: original.ocrB,
            ocrSpace: original.ocrSpace,
            ocrThreshold: original.ocrThreshold,
            ocrTrainedData: original.ocrTrainedData,
            ocrFills: original.ocrFills
        };
        for (let condition of original.conditions) {
            newfilter.conditions.push({
                left: condition.left,
                top: condition.top,
                width: condition.width,
                height: condition.height,
                operator: condition.operator,
                threshold: condition.threshold
            });
        }
        if (index === g_settings.filters.length - 1) {
            g_settings.filters.push(newfilter);
        } else {
            g_settings.filters = g_settings.filters
                .slice(0, index + 1)
                .concat(newfilter)
                .concat(g_settings.filters.slice(index + 1));
        }
        saveSettings();
        res.redirect(g_config.basepath + '/filters');
        return;
    });

    router.post('/filters/:filter/remove', function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        g_settings.filters.splice(index, 1);
        fs.unlink(path.join(g_config.presetdir, filter), function () { });
        saveSettings();
        res.redirect(g_config.basepath + '/filters');
    });

    router.post('/filters/:filter/edit', function (req, res) {
        let filter = req.params.filter;
        let index = findFilter(filter);
        if (!validateFilename(filter) || index < 0) {
            res.status(404);
            return;
        }
        let folder = req.body.folder;
        if (!validateFilename(folder)) {
            res.status(400);
            return;
        }
        let ocrTrainedData = req.body.ocr_trained_data;
        if (typeof (ocrTrainedData) !== 'string' || !g_workers[ocrTrainedData]) {
            res.status(400);
            return;
        }
        let count = req.body.left.length;
        let original = g_settings.filters[index];
        let newfilter: Filter = {
            name: original.name,
            folder: folder,
            enabled: original.enabled,
            conditions: [],
            ocrEnabled: !!req.body.ocr_enabled,
            ocrLeft: parseInt(req.body.ocr_left),
            ocrTop: parseInt(req.body.ocr_top),
            ocrWidth: parseInt(req.body.ocr_width),
            ocrHeight: parseInt(req.body.ocr_height),
            ocrR: parseInt(req.body.ocr_r),
            ocrG: parseInt(req.body.ocr_g),
            ocrB: parseInt(req.body.ocr_b),
            ocrSpace: req.body.ocr_space,
            ocrThreshold: Number(req.body.ocr_threshold),
            ocrTrainedData: ocrTrainedData,
            ocrFills: !!req.body.ocr_fills
        };
        if (Array.isArray(req.body.left)) {
            for (let i = 0; i < req.body.left.length; i++) {
                newfilter.conditions.push({
                    left: parseInt(req.body.left[i]),
                    top: parseInt(req.body.top[i]),
                    width: parseInt(req.body.width[i]),
                    height: parseInt(req.body.height[i]),
                    operator: String(req.body.operator[i]),
                    threshold: Number(req.body.threshold[i])
                });
            }
        }
        else {
            newfilter.conditions.push({
                left: parseInt(req.body.left),
                top: parseInt(req.body.top),
                width: parseInt(req.body.width),
                height: parseInt(req.body.height),
                operator: String(req.body.operator),
                threshold: Number(req.body.threshold)
            });
        }

        let imageBody = req.body.image.split(',')[1];
        if (!imageBody) {
            res.status(400);
            return;
        }
        g_settings.filters[index] = newfilter;
        let bytes = Buffer.from(imageBody, 'base64');
        fs.promises.writeFile(path.join(g_config.presetdir, filter), bytes);
        saveSettings();
        res.redirect(g_config.basepath + '/filters');
    });

    router.get('/images/:folder', async function (req, res) {
        let folder = req.params.folder;
        if (!validateFilename(folder)) {
            res.status(404).end();
            return;
        }
        let filelist = await listFiles(path.join(g_config.imagedir, folder));
        filelist = filelist.filter(validateExtension);
        if (req.query.type && req.query.type === 'json') {
            res.json(filelist);
        } else {
            let pages = Math.ceil(filelist.length / g_settings.imagesPerPage);
            let page = typeof req.query.page === 'string' ? parseInt(req.query.page) : 0;
            filelist = filelist.slice(
                g_settings.imagesPerPage * page,
                g_settings.imagesPerPage * (page + 1)
            );
            let files = [];
            for (let file of filelist) {
                let meta: MetaData = {
                    width: 0,
                    height: 0,
                    filter: '',
                    text: ''
                };
                try {
                    let json = await fs.promises.readFile(path.join(g_config.imagedir, folder, file + '.json'), 'utf-8');
                    meta = JSON.parse(json);
                } catch (e) {
                }
                meta['name'] = file;
                files.push(meta);
            }
            res.render('images', {
                param: {
                    folder: folder,
                    files: files,
                    page: page,
                    pages: pages
                }
            });
        }
    });

    router.get('/images/:folder/:file', async function (req, res) {
        let folder = req.params.folder;
        let file = req.params.file;
        if (!validateFilename(folder) || !validateFilename(file) || !validateExtension(file)) {
            res.status(404).end();
            return;
        }
        let image = path.join(g_config.imagedir, folder, file);
        if (req.query.type === 'json') {
            try {
                let json = await fs.promises.readFile(path.join(g_config.imagedir, folder, file + '.json'), 'utf-8');
                res.json(JSON.parse(json));
                return;
            } catch (e) { }
            try {
                let dimension = await getImageDimension(image);
                res.json(dimension);
                return;
            } catch (e) { }
            res.json({ width: 0, height: 0 });
            return;
        }
        if (req.query.type === 'thumb') {
            let thumb = path.join(g_config.thumbdir, folder, file + '.png');
            let statimage: fs.Stats;
            let statthumb: fs.Stats;
            try {
                statimage = await fs.promises.stat(image);
            } catch (e) {
                res.status(404).end();
                return;
            }
            await ignoreError(fs.promises.mkdir(path.join(g_config.thumbdir, folder), { recursive: true }));
            statthumb = await ignoreError(fs.promises.stat(thumb));
            if (!statthumb || statthumb.mtimeMs < statimage.mtimeMs) {
                try {
                    await resize(image, thumb, 256, 256);
                } catch (e) { }
            }
            res.sendFile(thumb);
            return;
        }
        res.sendFile(image);
    });

    router.get('/images/:folder/:file/edittext', async function (req, res) {
        let folder = req.params.folder;
        let file = req.params.file;
        if (!validateFilename(folder) || !validateFilename(file) || !validateExtension(file)) {
            res.status(404).end();
            return;
        }
        let searching = ('string' === typeof req.query.q);

        try {
            await fs.promises.stat(path.join(g_config.imagedir, folder, file));
        } catch (e) {
            res.status(404).end();
            return;
        }

        let meta: MetaData = {
            width: 0,
            height: 0,
            filter: '',
            text: ''
        };
        try {
            let json = await fs.promises.readFile(path.join(g_config.imagedir, folder, file + '.json'), 'utf-8');
            meta = JSON.parse(json);
        } catch (e) {
        }
        res.render('edittext', {
            param: {
                folder: folder,
                file: file,
                text: meta.text,
                search_q: req.query.q,
                search_folder: req.query.folder,
                search_page: req.query.page,
                searching: searching
            }
        });
    });

    router.post('/images/:folder/:file/edittext', async function (req, res) {
        let folder = req.params.folder;
        let file = req.params.file;
        if (!validateFilename(folder) || !validateFilename(file) || !validateExtension(file)) {
            res.status(404).end();
            return;
        }
        let searching = ('string' === typeof req.body.q);

        try {
            await fs.promises.stat(path.join(g_config.imagedir, folder, file));
        } catch (e) {
            res.status(404).end();
            return;
        }

        let meta: MetaData = {
            width: 0,
            height: 0,
            filter: '',
            text: ''
        };
        try {
            let json = await fs.promises.readFile(path.join(g_config.imagedir, folder, file + '.json'), 'utf-8');
            meta = JSON.parse(json);
        } catch (e) {
        }
        meta.text = req.body.text.replace(/[\n\r]/g, '');

        await ignoreError(fs.promises.writeFile(
            path.join(g_config.imagedir, folder, file + '.json'),
            JSON.stringify(meta)
        ));
        await textdb.set(folder, file, meta.text);

        if (searching) {
            let query = 'q=' + req.body.q;
            query += '&folder=' + req.body.folder;
            query += '&page=' + req.body.page;
            res.redirect(g_config.basepath + '/search?' + query);
        } else {
            res.redirect(g_config.basepath + '/images/' + folder);
        }
    });

    router.post('/images/:folder/:file/revert', async function (req, res) {
        let folder = req.params.folder;
        let file = req.params.file;
        if (!validateFilename(folder) || !validateFilename(file) || !validateExtension(file)) {
            res.status(404).end();
            return;
        }
        if (folder !== g_config.unclassifieddir) {
            await revertFile(folder, file);
        }
        if ('q' in req.body) {
            let query = 'q=' + req.body.q;
            query += '&folder=' + req.body.folder;
            query += '&page=' + req.body.page;
            res.redirect(g_config.basepath + '/search?' + query);
        } else {
            res.redirect(g_config.basepath + '/images/' + folder);
        }
    });

    router.get('/search', async function (req, res) {
        let folder = req.query.folder;
        if (typeof folder !== 'string' || !validateFilename(folder)) {
            folder = '';
        }
        let q = ('string' === typeof req.query.q) ? req.query.q : '';
        let page = ('string' === typeof req.query.page) ? parseInt(req.query.page) : 0;

        if ('string' !== typeof req.query.q) {
            let folders = await listDirectories(g_config.imagedir);
            res.render('search', {
                param: {
                    files: [],
                    q: '',
                    folder: '',
                    folders: folders,
                    page: 0,
                    pages: 1
                }
            });
            return;
        }
        let keywords = q.split(/\s+/);
        let results = await textdb.search(keywords, folder, g_settings.enableFuzzySearch);
        let pages = Math.max(1, Math.ceil(results.length / g_settings.imagesPerPage));
        results.sort(function (a, b) {
            let aa = a.folder + '/' + a.file;
            let bb = b.folder + '/' + b.file;
            return aa < bb ? -1 : aa > bb ? 1 : 0;
        });
        results = results.slice(
            g_settings.imagesPerPage * page,
            g_settings.imagesPerPage * (page + 1)
        );

        let files = [];
        if ('string' === typeof req.query.q) {
            for (let result of results) {
                let meta: MetaData = {
                    width: 0,
                    height: 0,
                    filter: '',
                    text: ''
                };
                try {
                    let json = await fs.promises.readFile(path.join(g_config.imagedir, result.folder, result.file + '.json'), 'utf-8');
                    meta = JSON.parse(json);
                } catch (e) {
                }
                meta['folder'] = result.folder;
                meta['name'] = result.file;
                files.push(meta);
            }
        }
        let folders = await listDirectories(g_config.imagedir);
        res.render('search', {
            param: {
                files: files,
                q: q,
                folder: folder,
                folders: folders,
                page: page,
                pages: pages
            }
        });
    });

    router.get('/log', async function (req, res) {
        if (req.query.type === 'json') {
            res.json(g_log);
        } else {
            res.render('log', {
                param: {
                    log: g_log
                }
            });
        }
    });

    router.get('/settings', async function (req, res) {
        let folders = await listDirectories(g_config.imagedir);
        res.render('settings', {
            param: {
                imagesPerPage: g_settings.imagesPerPage,
                enableFuzzySearch: g_settings.enableFuzzySearch,
                unmatcheddir: g_config.unmatcheddir,
                unclassifieddir: g_config.unclassifieddir,
                folders: folders
            }
        });
    });

    router.post('/settings', function (req, res) {
        g_settings.enableFuzzySearch = !!req.body.enable_fuzzy_search;

        if (req.body.images_per_page === '20') {
            g_settings.imagesPerPage = 20;
        }
        if (req.body.images_per_page === '50') {
            g_settings.imagesPerPage = 50;
        }
        if (req.body.images_per_page === '100') {
            g_settings.imagesPerPage = 100;
        }
        if (req.body.images_per_page === '200') {
            g_settings.imagesPerPage = 200;
        }
        saveSettings();
        res.redirect(g_config.basepath + '/settings');
    });

    router.post('/settings/refresh', function (req, res) {
        (async function () {
            info('検索インデックスの作成を開始します');
            textdb.refresh();
            info('検索インデックスの作成が完了しました');
        })();
        res.redirect(g_config.basepath + '/settings');
    });

    router.post('/settings/revert', async function (req, res) {
        let folder = req.body.folder;
        if (!validateFilename(folder)) {
            res.status(400).end();
            return;
        }

        try {
            if (folder !== g_config.unclassifieddir) {
                let filelist = await listFiles(path.join(g_config.imagedir, folder));
                filelist = filelist.filter(validateExtension);
                for (let file of filelist) {
                    await revertFile(folder, file);
                }
            }
        } catch (e) { }
        res.redirect(g_config.basepath + '/settings');
    });

    router.use('/scripts', express.static(path.join(__dirname, 'public', 'scripts')));
    router.use('/tessdata', express.static(g_config.tessdatadir));

    let app = express();
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'pug');
    app.set('port', process.env.PORT || 3000);
    app.use(g_config.basepath, router);

    let server = app.listen(app.get('port'), function () {
        console.log('Express server listening on port ' + (<net.AddressInfo>server.address()).port);
        info('ESFilter を起動しました - フィルターの自動実行が' + (g_settings.autofilterenabled ? '有' : '無') + '効です');
    });
}

async function initializeGlobals() {
    g_config = <Config>JSON.parse(await fs.promises.readFile('config.json', 'utf8'));

    g_settings = <Settings>{};
    try {
        await fs.promises.copyFile(
            path.join(__dirname, 'settings.json'),
            path.join(__dirname, 'settings.json.bak')
        );
        g_settings = <Settings>JSON.parse(await fs.promises.readFile('settings.json', 'utf8'));
    }
    catch (e) {
        g_settings = {
            autofilterenabled: false,
            imagesPerPage: 50,
            enableFuzzySearch: true,
            filters: []
        };
    }
    if (!g_settings.imagesPerPage || g_settings.imagesPerPage < 20) {
        g_settings.imagesPerPage = 20;
    }
    for (let filter of g_settings.filters) {
        if (!filter.ocrTrainedData) {
            filter.ocrTrainedData = g_config.defaulttraineddata;
        }
    }

    g_config.basepath = g_config.basepath.replace(/^(\/)?/, '/').replace(/\/$/, '');
    g_config.tessdatadir = path.resolve(g_config.tessdatadir);
    g_config.thumbdir = path.resolve(g_config.thumbdir);
    g_config.imagedir = path.resolve(g_config.imagedir);
    g_config.presetdir = path.resolve(g_config.presetdir);
    await fs.promises.mkdir(g_config.thumbdir, { recursive: true });
    await fs.promises.mkdir(path.join(g_config.imagedir, g_config.unclassifieddir), { recursive: true });
    await fs.promises.mkdir(g_config.presetdir, { recursive: true });

    g_ocrWorkerInitialized = initializeOcrWorker();

    (async function () {
        info('検索インデックスの作成を開始します');
        await textdb.initialize(
            g_config.imagedir,
            path.join(__dirname, 'textdb.json'),
            g_config.conversiontable
        );
        info('検索インデックスの作成が完了しました');
    })();

    beginWorker();
}

async function main() {
    await initializeGlobals();
    startExpress();
}

main();
