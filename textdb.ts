
import path = require('path');
import fs = require('fs');
import sem = require('await-semaphore');

let g_directory: string;
let g_databaseFile: string;
let g_conversionTable: { [key: string]: string };

let g_db: { [key: string]: string } = {};
let g_mutex = new sem.Mutex();

async function loadInternal() {
    let newdb = {};
    try {
        //newdb = JSON.parse(await fs.promises.readFile(g_databaseFile, 'utf-8'));
    } catch (e) {}
    g_db = newdb;
}

async function saveInternal() {
    try {
        //await fs.promises.writeFile(g_databaseFile, JSON.stringify(g_db));
    } catch (e) {}
}

async function scanInternal() {
    try {
        let directories = await fs.promises.readdir(g_directory, { withFileTypes: true });
        for (let directory of directories) {
            if (!directory.isDirectory()) {
                continue;
            }
            let files = await fs.promises.readdir(
                path.join(g_directory, directory.name),
                { withFileTypes: true }
            );
            for (let file of files) {
                if (!file.isFile() || !file.name.endsWith('.json')) {
                    continue;
                }
                let key = directory.name + '/' + file.name.substr(0, file.name.length - 5);
                if (key in g_db) {
                    continue;
                }
                try {
                    let filename = path.join(g_directory, directory.name, file.name);
                    let json = JSON.parse(await fs.promises.readFile(filename, 'utf-8'));
                    if ('string' === typeof json.text) {
                        g_db[key] = json.text;
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
}

export async function initialize(directory: string, databaseFile: string, conversionTable: { [key: string]: string }) {
    let release = await g_mutex.acquire();
    try {
        g_directory = directory;
        g_databaseFile = databaseFile;
        g_conversionTable = conversionTable;
        await loadInternal();
        await scanInternal();
        await saveInternal();
    } finally {
        release();
    }
}

export async function save() {
    let release = await g_mutex.acquire();
    try {
        await saveInternal();
    } finally {
        release();
    }
}

export async function refresh() {
    let release = await g_mutex.acquire();
    try {
        try {
            await fs.promises.unlink(g_databaseFile);
        } catch (e) { }
        g_db = {};
        await scanInternal();
        await saveInternal();
    } finally {
        release();
    }
}

export async function get(folder: string, file: string) {
    let text = '';
    let release = await g_mutex.acquire();
    try {
        text = g_db[folder + '/' + file];
    } finally {
        release();
    }
    return text;
}

export async function set(folder: string, file: string, text: string) {
    let release = await g_mutex.acquire();
    try {
        g_db[folder + '/' + file] = text;
        await saveInternal();
    } finally {
        release();
    }
}

export async function remove(folder: string, file: string) {
    let release = await g_mutex.acquire();
    try {
        delete g_db[folder + '/' + file];
        await saveInternal();
    } finally {
        release();
    }
}

export async function search(keywords: string[], folder?: string, enableConversion?: boolean) {
    let release = await g_mutex.acquire();
    let keys: { folder: string, file: string }[] = [];
    try {
        let convert = function (text: string) { return text; };
        if (enableConversion) {
            convert = function (text: string) {
                for (let key in g_conversionTable) {
                    text = text.split(key).join(g_conversionTable[key]);
                }
                return text;
            }
        }
        function test(text: string, keywords: string[]) {
            text = convert(text);
            for (let keyword of keywords) {
                if (!text.match(convert(keyword))) {
                    return false;
                }
            }
            return true;
        }
        for (let key in g_db) {
            if (folder && !key.startsWith(folder + '/')) {
                continue;
            }
            if (test(g_db[key], keywords)) {
                keys.push({ folder: key.split('/')[0], file: key.split('/')[1] });
            }
        }
    } finally {
        release();
    }
    return keys;
}
