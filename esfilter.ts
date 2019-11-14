
import express = require('express');
import path = require('path');
import net = require('net');
import fs = require('fs');
import im = require('imagemagick');
import bodyParser = require('body-parser');
import canvas = require('canvas');
import * as compare from './scripts/compare';


class Config {
    thumbdir: string;
    imagedir: string;
    presetdir: string;
    unclassifieddir: string;
    unmatcheddir: string;
    validextensions: string[];
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
};
class Settings {
    autofilterenabled: boolean;
    filters: Filter[];
};

let g_config = <Config>JSON.parse(fs.readFileSync('config.json', 'utf8'));

let g_settings = <Settings>{};
try {
    fs.copyFileSync(
        path.join(__dirname, 'settings.json'),
        path.join(__dirname, 'settings.json.bak')
    );
    g_settings = <Settings>JSON.parse(fs.readFileSync('settings.json', 'utf8'));
}
catch (e) {
    g_settings = {
        autofilterenabled: false,
        filters: []
    };
}

g_config.thumbdir = path.resolve(g_config.thumbdir);
g_config.imagedir = path.resolve(g_config.imagedir);
g_config.presetdir = path.resolve(g_config.presetdir);
fs.mkdirSync(g_config.thumbdir, { recursive: true });
fs.mkdirSync(g_config.imagedir, { recursive: true });
fs.mkdirSync(g_config.presetdir, { recursive: true });

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

let g_info = <string[]>[];
function info(message: string) {
    let date = formatDate(new Date());
    console.log(date + ' ' + message);
    g_info.push(date + ' ' + message);
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
                if (entry.isDirectory() || entry.isSymbolicLink()) {
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

let g_busy = false;

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
                if (evaluateCondition(filter.conditions, filterImage, image)) {
                    (async function () {
                        await ignoreError(fs.promises.mkdir(path.join(g_config.thumbdir, filter.folder)));
                        await ignoreError(fs.promises.rename(
                            path.join(g_config.thumbdir, g_config.unclassifieddir, file + '.png'),
                            path.join(g_config.thumbdir, filter.folder, file + '.png')
                        ));
                    })();
                    await ignoreError(fs.promises.mkdir(path.join(g_config.imagedir, filter.folder)));
                    await fs.promises.rename(
                        filename,
                        path.join(g_config.imagedir, filter.folder, file)
                    );
                    info(file + ' はフィルター "' + filter.name + '" によって振り分けられました');
                } else {
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
                    if (evaluateCondition(filter.filter.conditions, filter.image, image)) {
                        (async function () {
                            await ignoreError(fs.promises.mkdir(path.join(g_config.thumbdir, filter.filter.folder)));
                            await ignoreError(fs.promises.rename(
                                path.join(g_config.thumbdir, g_config.unclassifieddir, file + '.png'),
                                path.join(g_config.thumbdir, filter.filter.folder, file + '.png')
                            ));
                        })();
                        await ignoreError(fs.promises.mkdir(path.join(g_config.imagedir, filter.filter.folder)));
                        await fs.promises.rename(
                            filename,
                            path.join(g_config.imagedir, filter.filter.folder, file)
                        );
                        info(file + ' はフィルター "' + filter.filter.name + '" によって振り分けられました');
                        filtered = true;
                        break;
                    }
                }
                if (!filtered) {
                    (async function () {
                        await ignoreError(fs.promises.mkdir(path.join(g_config.thumbdir, g_config.unmatcheddir)));
                        await ignoreError(fs.promises.rename(
                            path.join(g_config.thumbdir, g_config.unclassifieddir, file + '.png'),
                            path.join(g_config.thumbdir, g_config.unmatcheddir, file + '.png')
                        ));
                    })();
                    await ignoreError(fs.promises.mkdir(path.join(g_config.imagedir, g_config.unmatcheddir)));
                    await fs.promises.rename(
                        filename,
                        path.join(g_config.imagedir, g_config.unmatcheddir, file)
                    );
                    info(file + ' は ' + g_config.unmatcheddir + ' へ移動されました');
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

async function beginWorker() {
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
}

let app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(bodyParser.urlencoded({ extended: true, limit: 100*1024*1024 }));

app.get('/', async function (req, res) {
    let folders = await listDirectories(g_config.imagedir);
    res.render('index', {
        param: {
            isAutoFilterEnabled: g_settings.autofilterenabled,
            folders: folders,
            log: g_info
        }
    });
});

app.post('/autofilter/enable', function (req, res) {
    if (!g_settings.autofilterenabled) {
        info('フィルターの自動実行を開始します');
        g_settings.autofilterenabled = true;
        saveSettings();
    }
    res.redirect('/filters');
});

app.post('/autofilter/disable', function (req, res) {
    if (g_settings.autofilterenabled) {
        info('フィルターの自動実行を停止します');
        g_settings.autofilterenabled = false;
        saveSettings();
    }
    res.redirect('/filters');
});

app.post('/autofilter/once', function (req, res) {
    if (g_settings.autofilterenabled) {
        res.redirect('/filters?status=error');
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
    res.redirect('/filters');
});

app.get('/filters', function (req, res) {
    res.render('filters', {
        param: {
            filters: g_settings.filters,
            isAutoFilterEnabled: g_settings.autofilterenabled,
            status: req.query.status,
            log: g_info
        }
    });
});

app.get('/filters/:filter', async function (req, res) {
    let index = findFilter(req.params.filter);
    if (index < 0) {
        res.status(404);
        return;
    }
    let image = '';
    let mime = '';
    try {
        image = await fs.promises.readFile(path.join(g_config.presetdir, req.params.filter), 'base64');
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
            folders: await listDirectories(g_config.imagedir)
        }
    });
});

app.post('/filters/:filter/run', function (req, res) {
    let index = findFilter(req.params.filter);
    if (index < 0) {
        res.status(404);
        return;
    }
    (async function () {
        info('フィルター "' + req.params.filter + '" の単独実行を開始します');
        if (await runSingleFilter(g_settings.filters[index])) {
            info('フィルター "' + req.params.filter + '" の単独実行を完了しました');
        } else {
            info('他のジョブが実行中のためフィルター "' + req.params.filter + '" の単独実行を中止しました');
        }
    })();
    res.redirect('/filters');
});

app.post('/filters/:filter/enable', function (req, res) {
    let index = findFilter(req.params.filter);
    if (index < 0) {
        res.status(404);
        return;
    }
    g_settings.filters[index].enabled = true;
    saveSettings();
    res.redirect('/filters');
});

app.post('/filters/:filter/disable', function (req, res) {
    let index = findFilter(req.params.filter);
    if (index < 0) {
        res.status(404);
        return;
    }
    g_settings.filters[index].enabled = false;
    saveSettings();
    res.redirect('/filters');
});

app.post('/filters/:filter/up', function (req, res) {
    let index = findFilter(req.params.filter);
    if (index < 0) {
        res.status(404);
        return;
    }
    if (index > 0) {
        let tmp = g_settings.filters[index];
        g_settings.filters[index] = g_settings.filters[index - 1];
        g_settings.filters[index - 1] = tmp;
        saveSettings();
    }
    res.redirect('/filters');
});

app.post('/filters/:filter/down', function (req, res) {
    let index = findFilter(req.params.filter);
    if (index < 0) {
        res.status(404);
        return;
    }
    if (index + 1 < g_settings.filters.length) {
        let tmp = g_settings.filters[index];
        g_settings.filters[index] = g_settings.filters[index + 1];
        g_settings.filters[index + 1] = tmp;
        saveSettings();
    }
    res.redirect('/filters');
});

app.post('/filters/:filter/newfilter', async function (req, res) {
    let index = findFilter(req.params.filter);
    if (index >= 0) {
        res.redirect('/filters?status=error');
        return;
    }
    if (!validateFilename(req.params.filter)) {
        res.redirect('/filters?status=error');
        return;
    }
    g_settings.filters.push({
        name: req.params.filter,
        folder: '',
        enabled: false,
        conditions: [{
            left: 0,
            top: 0,
            width: 1,
            height: 1,
            operator: 'rgbmse',
            threshold: 0
        }]
    });
    saveSettings();
    res.redirect('/filters/' + req.params.filter);
    return;
});

app.post('/filters/:filter/rename', async function (req, res) {
    let index = findFilter(req.params.filter);
    if (index < 0) {
        res.status(404);
        return;
    }
    if (!validateFilename(req.query.newname)) {
        res.redirect('/filters?status=error');
        return;
    }
    let newindex = findFilter(req.query.newname);
    if (newindex >= 0) {
        res.redirect('/filters?status=error');
        return;
    }
    await ignoreError(fs.promises.rename(
        path.join(g_config.presetdir, req.params.filter),
        path.join(g_config.presetdir, req.query.newname)
    ));
    g_settings.filters[index].name = req.query.newname;
    saveSettings();
    res.redirect('/filters');
    return;
});

app.post('/filters/:filter/copy', async function (req, res) {
    let index = findFilter(req.params.filter);
    if (index < 0) {
        res.status(404);
        return;
    }
    if (!validateFilename(req.query.newname)) {
        res.redirect('/filters?status=error');
        return;
    }
    let newindex = findFilter(req.query.newname);
    if (newindex >= 0) {
        res.redirect('/filters?status=error');
        return;
    }
    await ignoreError(fs.promises.copyFile(
        path.join(g_config.presetdir, req.params.filter),
        path.join(g_config.presetdir, req.query.newname)
    ));
    let newfilter = <Filter>{};
    let original = g_settings.filters[index];
    newfilter.name = req.query.newname;
    newfilter.folder = original.folder;
    newfilter.enabled = original.enabled;
    newfilter.conditions = <Condition[]>[];
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
    g_settings.filters.push(newfilter);
    saveSettings();
    res.redirect('/filters');
    return;
});

app.post('/filters/:filter/remove', function (req, res) {
    let index = findFilter(req.params.filter);
    if (index < 0) {
        res.status(404);
        return;
    }
    g_settings.filters.splice(index);
    fs.unlink(path.join(g_config.presetdir, req.params.filter), function () { });
    saveSettings();
    res.redirect('/filters');
});

app.post('/filters/:filter/edit', function (req, res) {
    let index = findFilter(req.params.filter);
    if (index < 0) {
        res.status(404);
        return;
    }
    if (!validateFilename(req.body.folder)) {
        res.redirect('/filters?status=error');
        return;
    }
    let filter = g_settings.filters[index];
    filter.folder = String(req.body.folder);
    filter.conditions = [];
    if (Array.isArray(req.body.left)) {
        for (let i = 0; i < req.body.left.length; i++) {
            filter.conditions.push({
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
        filter.conditions.push({
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
        res.redirect('/filters?status=error');
        return;
    }
    let bytes = Buffer.from(imageBody, 'base64');
    fs.promises.writeFile(path.join(g_config.presetdir, req.params.filter), bytes);
    saveSettings();
    res.redirect('/filters');
});

app.get('/images/:folder', async function (req, res) {
    let folder = req.params.folder;
    let files = await listFiles(path.join(g_config.imagedir, folder));
    files = files.filter(validateExtension);
    if (req.query.type && req.query.type === 'json') {
        res.json(files);
    } else {
        res.render('images', {
            param: {
                folder: folder,
                files: files
            }
        });
    }
});

app.get('/images/:folder/:file', async function (req, res) {
    let folder = req.params.folder;
    let file = req.params.file;
    if (!validateExtension(file)) {
        res.status(404);
        return;
    }
    let image = path.join(g_config.imagedir, folder, file);
    if (req.query.type) {
        if (req.query.type === 'json') {
            im.identify(image, function (err, features) {
                if (err) {
                    res.json({ width: 0, height: 0 });
                } else {
                    res.json({ width: features.width, height: features.height });
                }
            });
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
            await ignoreError(fs.promises.mkdir(path.join(g_config.thumbdir, folder)));
            statthumb = await ignoreError(fs.promises.stat(thumb));
            if (!statthumb || statthumb.mtimeMs < statimage.mtimeMs) {
                await new Promise(function (resolve) { im.convert([image, '-resize', '256x256', thumb], resolve); });
            }
            res.sendFile(thumb);
            return;
        }
    } else {
        res.sendFile(image);
    }
});

app.get('/log', async function (req, res) {
    if (req.query.type && req.query.type === 'json') {
        res.json(g_info);
    } else {
        res.render('log', {
            param: {
                log: g_info
            }
        });
    }
});

app.use('/scripts', express.static(path.join(__dirname, 'public', 'scripts')));

app.set('port', process.env.PORT || 3000);

let server = app.listen(app.get('port'), function () {
    console.log('Express server listening on port ' + (<net.AddressInfo>server.address()).port);
    info('ESFilter を起動しました - フィルターの自動実行が' + (g_settings.autofilterenabled ? '有' : '無') + '効です');
});

beginWorker();
