
export class PrefilterOptions {
    textColor: {
        r: number,
        g: number,
        b: number
    };
    space: 'rgb' | 'r' | 'g' | 'b' | 'y' | 'lab';
    distance: number;
    fills: boolean;
}

function plot(image: ImageData, x: number, y: number, condition: boolean) {
    let index = (x + y * image.width) * 4;
    if (condition) {
        image.data[index] = 0;
        image.data[index + 1] = 0;
        image.data[index + 2] = 0;
        image.data[index + 3] = 255;
    } else {
        image.data[index] = 255;
        image.data[index + 1] = 255;
        image.data[index + 2] = 255;
        image.data[index + 3] = 255;
    }
}

function binarizeByRDistance(
    input: ImageData,
    output: ImageData,
    left: number, top: number,
    center: { r: number, g: number, b: number },
    distance: number
) {
    for (let y = 0; y < output.height; y++) {
        for (let x = 0; x < output.width; x++) {
            let srcIndex = (x + left + (y + top) * input.width) * 4;
            let ri = input.data[srcIndex];
            plot(output, x, y, Math.abs(ri - center.r) <= distance);
        }
    }
}

function binarizeByGDistance(
    input: ImageData,
    output: ImageData,
    left: number, top: number,
    center: { r: number, g: number, b: number },
    distance: number
) {
    for (let y = 0; y < output.height; y++) {
        for (let x = 0; x < output.width; x++) {
            let srcIndex = (x + left + (y + top) * input.width) * 4;
            let gi = input.data[srcIndex + 1];
            plot(output, x, y, Math.abs(gi - center.g) <= distance);
        }
    }
}

function binarizeByBDistance(
    input: ImageData,
    output: ImageData,
    left: number, top: number,
    center: { r: number, g: number, b: number },
    distance: number
) {
    for (let y = 0; y < output.height; y++) {
        for (let x = 0; x < output.width; x++) {
            let srcIndex = (x + left + (y + top) * input.width) * 4;
            let bi = input.data[srcIndex + 2];
            plot(output, x, y, Math.abs(bi - center.b) <= distance);
        }
    }
}

function binarizeByRgbDistance(
    input: ImageData,
    output: ImageData,
    left: number, top: number,
    center: { r: number, g: number, b: number },
    distance: number
) {
    let dd = distance * distance;
    for (let y = 0; y < output.height; y++) {
        for (let x = 0; x < output.width; x++) {
            let srcIndex = (x + left + (y + top) * input.width) * 4;
            let destIndex = (x + output.width * y) * 4;
            let rd = center.r - input.data[srcIndex];
            let gd = center.g - input.data[srcIndex + 1];
            let bd = center.b - input.data[srcIndex + 2];
            plot(output, x, y, rd * rd + gd * gd + bd * bd <= dd);
        }
    }
}

function binarizeByYDistance(
    input: ImageData,
    output: ImageData,
    left: number, top: number,
    center: { r: number, g: number, b: number },
    distance: number
) {
    let y0 = 0.299 * center.r + 0.587 * center.g + 0.114 * center.b;
    for (let y = 0; y < output.height; y++) {
        for (let x = 0; x < output.width; x++) {
            let srcIndex = (x + left + (y + top) * input.width) * 4;
            let destIndex = (x + output.width * y) * 4;
            let ri = input.data[srcIndex];
            let gi = input.data[srcIndex + 1];
            let bi = input.data[srcIndex + 2];
            let yi = 0.299 * ri + 0.587 * gi + 0.114 * bi;
            plot(output, x, y, Math.abs(yi - y0) <= distance);
        }
    }
}

function binarizeByLabDistance(
    input: ImageData,
    output: ImageData,
    left: number, top: number,
    center: { r: number, g: number, b: number },
    distance: number
) {
    function rgbToLab(r: number, g: number, b: number) {
        function linearize(v: number) {
            v /= 255;
            if (v <= 0.04045) {
                return v / 12.92;
            } else {
                return Math.pow((v + 0.055) / 1.055, 2.4);
            }
        }
        let rl = linearize(r);
        let gl = linearize(g);
        let bl = linearize(b);
        let x = 0.4124 * rl + 0.3576 * gl + 0.1805 * bl;
        let y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
        let z = 0.0193 * rl + 0.1192 * gl + 0.9505 * bl;
        function f(t: number) {
            if (t > (6 * 6 * 6) / (29 * 29 * 29)) {
                return Math.pow(t, 1 / 3);
            } else {
                return (29 * 29) / (6 * 6 * 3) * t + 4 / 29;
            }
        }
        let xn = 0.3127;
        let yn = 0.3290;
        let zn = 0.3583;
        let xf = f(x / xn);
        let yf = f(y / yn);
        let zf = f(z / zn);
        return {
            l: 116 * yf - 16,
            a: 500 * (xf - yf),
            b: 200 * (yf - zf)
        };
    }
    let lab0 = rgbToLab(center.r, center.g, center.b);
    let dd = distance * distance;
    for (let y = 0; y < output.height; y++) {
        for (let x = 0; x < output.width; x++) {
            let srcIndex = (x + left + (y + top) * input.width) * 4;
            let destIndex = (x + output.width * y) * 4;
            let labi = rgbToLab(
                input.data[srcIndex],
                input.data[srcIndex + 1],
                input.data[srcIndex + 2]
            );
            let ld = labi.l - lab0.l;
            let ad = labi.a - lab0.a;
            let bd = labi.b - lab0.b;
            plot(output, x, y, ld * ld + ad * ad + bd * bd <= dd);
        }
    }
}

function fill(image: ImageData) {
    function get(x: number, y: number) {
        return image.data[(x + y * image.width) * 4];
    }
    function set(x: number, y: number, value: number) {
        let index = (x + y * image.width) * 4;
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = 255;
    }
    let buf = new Uint8Array(image.width * image.height);
    function getbuf(x: number, y: number) {
        return buf[x + y * image.width];
    }
    function setbuf(x: number, y: number, value: number) {
        buf[x + y * image.width] = value;
    }
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            setbuf(x, y, get(x, y));
        }
    }
    {
        let updates: { x: number, y: number }[] = [];
        if (get(0, 0) === 0) {
            set(0, 0, 255);
            setbuf(0, 0, 1);
            updates.push({ x: 0, y: 0 });
        }
        while (updates.length > 0) {
            let pos = updates.pop();
            if (pos.x - 1 >= 0 && get(pos.x - 1, pos.y) === 0) {
                set(pos.x - 1, pos.y, 255);
                setbuf(pos.x - 1, pos.y, 1);
                updates.push({ x: pos.x - 1, y: pos.y });
            }
            if (pos.x + 1 < image.width && get(pos.x + 1, pos.y) === 0) {
                set(pos.x + 1, pos.y, 255);
                setbuf(pos.x + 1, pos.y, 1);
                updates.push({ x: pos.x + 1, y: pos.y });
            }
            if (pos.y - 1 >= 0 && get(pos.x, pos.y - 1) === 0) {
                set(pos.x, pos.y - 1, 255);
                setbuf(pos.x, pos.y - 1, 1);
                updates.push({ x: pos.x, y: pos.y - 1 });
            }
            if (pos.y + 1 < image.height && get(pos.x, pos.y + 1) === 0) {
                set(pos.x, pos.y + 1, 255);
                setbuf(pos.x, pos.y + 1, 1);
                updates.push({ x: pos.x, y: pos.y + 1 });
            }
        }
    }
    for (let i = 1; i <= 2; i++) {
        for (let y = 1; y < image.height - 1; y++) {
            for (let x = 1; x < image.width - 1; x++) {
                if (getbuf(x, y) !== i) {
                    if (getbuf(x - 1, y) === i ||
                        getbuf(x + 1, y) === i ||
                        getbuf(x, y - 1) === i ||
                        getbuf(x, y + 1) === i
                    ) {
                        setbuf(x, y, i + 1);
                    }
                }
            }
        }
    }
    {
        let updates: { x: number, y: number }[] = [];
        if (getbuf(0, 0) !== 255) {
            setbuf(0, 0, 255);
            updates.push({ x: 0, y: 0 });
        }
        while (updates.length > 0) {
            let pos = updates.pop();
            if (pos.x - 1 >= 0 && getbuf(pos.x - 1, pos.y) !== 255) {
                setbuf(pos.x - 1, pos.y, 255);
                updates.push({ x: pos.x - 1, y: pos.y });
            }
            if (pos.x + 1 < image.width && getbuf(pos.x + 1, pos.y) !== 255) {
                setbuf(pos.x + 1, pos.y, 255);
                updates.push({ x: pos.x + 1, y: pos.y });
            }
            if (pos.y - 1 >= 0 && getbuf(pos.x, pos.y - 1) !== 255) {
                setbuf(pos.x, pos.y - 1, 255);
                updates.push({ x: pos.x, y: pos.y - 1 });
            }
            if (pos.y + 1 < image.height && getbuf(pos.x, pos.y + 1) !== 255) {
                setbuf(pos.x, pos.y + 1, 255);
                updates.push({ x: pos.x, y: pos.y + 1 });
            }
        }
    }
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            if (getbuf(x, y) !== 255) {
                set(x, y, 255);
            }
        }
    }
}

export function prefilter(
    canvas: HTMLCanvasElement,
    image: ImageData,
    area: { left: number, top: number, width: number, height: number },
    options: PrefilterOptions
) {
    canvas.width = area.width;
    canvas.height = area.height;
    let ctx = canvas.getContext('2d');
    let filtered = ctx.createImageData(area.width, area.height);
    switch (options.space) {
        case 'r':
            binarizeByRDistance(image, filtered, area.left, area.top, options.textColor, options.distance);
            break;
        case 'g':
            binarizeByGDistance(image, filtered, area.left, area.top, options.textColor, options.distance);
            break;
        case 'b':
            binarizeByBDistance(image, filtered, area.left, area.top, options.textColor, options.distance);
            break;
        case 'y':
            binarizeByYDistance(image, filtered, area.left, area.top, options.textColor, options.distance);
            break;
        case 'rgb':
            binarizeByRgbDistance(image, filtered, area.left, area.top, options.textColor, options.distance);
            break;
        case 'lab':
            binarizeByLabDistance(image, filtered, area.left, area.top, options.textColor, options.distance);
            break;
    }
    if (options.fills) {
        fill(filtered);
    }
    ctx.putImageData(filtered, 0, 0);
}
