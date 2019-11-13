
export function getImageData(image: HTMLImageElement, canvas: HTMLCanvasElement) {
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    canvas.width = width;
    canvas.height = height;
    let ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, width, height);
}

export function calculateRgbmse(image1: ImageData, image2: ImageData, area: { left: number, top: number, width: number, height: number }) {
    let value = 0;
    for (let y = area.top; y < area.top + area.height; y++) {
        for (let x = area.left; x < area.left + area.width; x++) {
            let r1 = image1.data[(x + image1.width * y) * 4];
            let g1 = image1.data[(x + image1.width * y) * 4 + 1];
            let b1 = image1.data[(x + image1.width * y) * 4 + 2];
            let r2 = image2.data[(x + image2.width * y) * 4];
            let g2 = image2.data[(x + image2.width * y) * 4 + 1];
            let b2 = image2.data[(x + image2.width * y) * 4 + 2];
            let rd = r1 - r2;
            let gd = g1 - g2;
            let bd = b1 - b2;
            value += rd * rd + gd * gd + bd * bd;
        }
    }
    return value / (area.width * area.height * 3);
}

export function calculateRgbmae(image1: ImageData, image2: ImageData, area: { left: number, top: number, width: number, height: number }) {
    let value = 0;
    for (let y = area.top; y < area.top + area.height; y++) {
        for (let x = area.left; x < area.left + area.width; x++) {
            let r1 = image1.data[(x + image1.width * y) * 4];
            let g1 = image1.data[(x + image1.width * y) * 4 + 1];
            let b1 = image1.data[(x + image1.width * y) * 4 + 2];
            let r2 = image2.data[(x + image2.width * y) * 4];
            let g2 = image2.data[(x + image2.width * y) * 4 + 1];
            let b2 = image2.data[(x + image2.width * y) * 4 + 2];
            let rd = r1 - r2;
            let gd = g1 - g2;
            let bd = b1 - b2;
            value += Math.abs(rd) + Math.abs(gd) + Math.abs(bd);
        }
    }
    return value / (area.width * area.height * 3);
}

export function calculateMse(image1: ImageData, image2: ImageData, area: { left: number, top: number, width: number, height: number }) {
    let value = 0;
    for (let y = area.top; y < area.top + area.height; y++) {
        for (let x = area.left; x < area.left + area.width; x++) {
            let r1 = image1.data[(x + image1.width * y) * 4];
            let g1 = image1.data[(x + image1.width * y) * 4 + 1];
            let b1 = image1.data[(x + image1.width * y) * 4 + 2];
            let r2 = image2.data[(x + image2.width * y) * 4];
            let g2 = image2.data[(x + image2.width * y) * 4 + 1];
            let b2 = image2.data[(x + image2.width * y) * 4 + 2];
            let y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
            let y2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
            let yd = y1 - y2;
            value += yd * yd;
        }
    }
    return value / (area.width * area.height);
}

export function calculateMae(image1: ImageData, image2: ImageData, area: { left: number, top: number, width: number, height: number }) {
    let value = 0;
    for (let y = area.top; y < area.top + area.height; y++) {
        for (let x = area.left; x < area.left + area.width; x++) {
            let r1 = image1.data[(x + image1.width * y) * 4];
            let g1 = image1.data[(x + image1.width * y) * 4 + 1];
            let b1 = image1.data[(x + image1.width * y) * 4 + 2];
            let r2 = image2.data[(x + image2.width * y) * 4];
            let g2 = image2.data[(x + image2.width * y) * 4 + 1];
            let b2 = image2.data[(x + image2.width * y) * 4 + 2];
            let y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
            let y2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
            let yd = y1 - y2;
            value += Math.abs(yd);
        }
    }
    return value / (area.width * area.height);
}

export function calculateCorrelation(image1: ImageData, image2: ImageData, area: { left: number, top: number, width: number, height: number }) {

    function generateLuma(image: ImageData) {
        let luma = new Float64Array(area.width * area.height);
        for (let y = area.top; y < area.top + area.height; y++) {
            for (let x = area.left; x < area.left + area.width; x++) {
                let r1 = image.data[(x + image.width * y) * 4];
                let g1 = image.data[(x + image.width * y) * 4 + 1];
                let b1 = image.data[(x + image.width * y) * 4 + 2];
                let y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
                luma[(x - area.left) + area.width * (y - area.top)] = y1;
            }
        }
        return luma;
    }
    let n = area.width * area.height;
    let luma1 = generateLuma(image1);
    let luma2 = generateLuma(image2);

    // arithmatic mean
    let am1 = luma1.reduce(function (acc, cur) { return acc + cur; }) / n;
    let am2 = luma2.reduce(function (acc, cur) { return acc + cur; }) / n;

    // variance
    let var1 = luma1.reduce(function (acc, cur) { return acc + (cur - am1) * (cur - am1); }) / n;
    let var2 = luma2.reduce(function (acc, cur) { return acc + (cur - am2) * (cur - am2); }) / n;

    // covariance
    let cov = function () {
        let value = 0;
        for (let i = 0; i < n; i++) {
            value += (luma1[i] - am1) * (luma2[i] - am2);
        }
        return value / n;
    }();

    return cov / Math.sqrt(var1 * var2);
}
