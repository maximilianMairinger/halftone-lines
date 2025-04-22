import { decode, encode } from "fast-png"
import path from "path"
import { $, file as bunFile, write as writeFile } from "bun"
import fs from "fs/promises"

type Image = number[][]

export function makeBins([from, to]: [from: number, to: number], n: number) {
  const bins = [from]
  const delta = to - from 
  const stepSize = delta / (n - 1)
  for (let i = 1; i < n - 1; i++) {
    bins.push(from + stepSize * i)
  }
  bins.push(to)
  return bins
}

// export function findClosestIndexAssumingLinearity(list: number[]) {
//   return function(el: number) {
//     let index = Math.floor(list.length / 2 - 1)
//     const comp = list[index]
//     const delta = el - comp
//   }
// }




export function findClosestStepIncrement(num: number, step: number) {
  // num = Math.round(step * n)
  const n = Math.round(num / step)
  return n * step
}


export function downsampleBWImage(img: Image, nColors: number = 255) {
  return img.map((row) => 
    row.map((px) => {
      return findClosestStepIncrement(px, (nColors-1)**-1)
    })
  )
}

export async function openTmpFolder(pth: string, {commonName, ext = "png", numerate = false}: {commonName?: string, ext?: string, numerate?: boolean}) {
  const toBeDel = new Set<string>()
  const known = new Set<string>()
  await fs.mkdir(pth, { recursive: true })
  let n = 1

  function file(name: string) {
    const fileName = `${commonName !== undefined ? `${commonName}-` : ""}${numerate ? `${n++}-` : ""}${name}.${ext}`
    
    const filePath = path.join(pth, fileName)

    if (known.has(filePath)) throw new Error("Filename not unique")
    known.add(filePath)
    const ret = {
      write(data: Uint8Array) {
        const prom = new Promise(async (res) => {
          await writeFile(filePath, Buffer.from(data))
          res(ret)
        }) as Promise<typeof ret> & { free: (...a: Parameters<typeof ret["free"]>) => Promise<ReturnType<typeof ret["free"]>> }
        prom.free = async () => {
          await prom
          return ret.free()
        }

        return prom
      },
      writeImg(img: number[][]) {
        return ret.write(encodeBWPngFromMatrix(img))
      },
      fileName,
      filePath,
      free() {
        known.delete(filePath)
        toBeDel.add(filePath)
        return filePath
      },
      read() {
        return bunFile(filePath)
      }
    }
    return ret
  }
  file.cleanup = async function() {
    await Promise.all([...toBeDel].map((fileName) => {
      return fs.unlink(fileName)
    }))
  }
  return file
}


export function makeWhiteOffWhite(img: number[][]) {
  const out = [] as number[][]
  for (let i = 0; i < img.length; i++) {
    const row = [] as number[]
    for (let j = 0; j < img[0].length; j++) {
      row.push(img[i][j] >= .95 ? .95 : img[i][j])
    }
    out.push(row)
  }
  return out
}

export function invertImage(img: number[][]) {
  const out = [] as number[][]
  for (let i = 0; i < img.length; i++) {
    const row = [] as number[]
    for (let j = 0; j < img[0].length; j++) {
      row.push(1 - img[i][j])
    }
    out.push(row)
  }
  return out
}



export function convolution2D(img: number[][], kernel: number[][]) {
  if (img.length === 0) return [];
  
  // Find minimum row length
  const minRowLength = Math.min(...img.map(row => row.length));
  const kernelHeight = kernel.length;
  const kernelWidth = kernel[0].length;
  const out = [] as number[][];

  // Only process where full kernel can be applied
  for (let i = 0; i <= img.length - kernelHeight; i++) {
    const row = [] as number[];

    // ——> compute the min width of *just* the rows we're about to convolve
    const blockMinWidth = Math.min(
      ...img
      .slice(i, i + kernelHeight)
      .map(r => r.length)
    );

    for (let j = 0; j <= blockMinWidth - kernelWidth; j++) {
      let sum = 0;
      let valid = true;
      
      // Verify kernel fits at this position
      for (let k = 0; k < kernelHeight && valid; k++) {
        if (i + k >= img.length || img[i + k].length < j + kernelWidth) {
          valid = false;
          break;
        }
      }
      
      if (valid) {
        for (let k = 0; k < kernelHeight; k++) {
          for (let l = 0; l < kernelWidth; l++) {
            sum += img[i + k][j + l] * kernel[k][l];
          }
        }
        row.push(sum);
      }
    }
    if (row.length > 0) {
      out.push(row);
    }
  }
  return out;
}





export function encodeBWPngFromMatrix(image: number[][]) {
  // Calculate dimensions
  const height = image.length;
  const width = image[0].length;
  
  // Create flat data array in proper order
  const data = new Uint8Array(height * width) as Uint8Array<ArrayBuffer>
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = Math.max(0, Math.min(255, Math.round(image[y][x] * 255)));
    }
  }

  return encode({
    data,
    channels: 1,
    width: width,       // Width is number of columns
    height: height,     // Height is number of rows
    depth: 8
  })
}





export function decodeRGBPngToBwMatrix(imageBinary: Uint8Array) {
  const imgData = decode(imageBinary)

  const bwImg = []
  for (let i = 0; i < imgData.height * imgData.width; i++) {
    const rgb = [] as any as [number, number, number]
    for (let j = 0; j < imgData.channels; j++) {
      rgb.push(imgData.data[i * imgData.channels + j] / 255)
    }

    bwImg.push(calculateBrightness(...rgb))
  }

  const img = [] as number[][]
  for (let i = 0; i < imgData.height; i++) {
    const row = []
    for (let j = 0; j < imgData.width; j++) {
      row.push(bwImg[i * imgData.width + j])
    }
    img.push(row)
  }

  return img
}







export function calculateBrightness(r: number, g: number, b: number): number {
  // Ensure inputs are in the range [0, 1]
  const sanitize = (value: number) => {
    if (value < 0) throw new Error("Value cannot be less than 0");
    if (value > 1) throw new Error("Value cannot be greater than 1");
    return value
  }
  r = sanitize(r);
  g = sanitize(g);
  b = sanitize(b);

  // Gamma expansion function
  const gammaExpand = (cSRGB: number): number => {
      if (cSRGB <= 0.04045) {
          return cSRGB / 12.92;
      } else {
          return Math.pow((cSRGB + 0.055) / 1.055, 2.4);
      }
  };

  // Apply gamma expansion to each channel
  const rLinear = gammaExpand(r);
  const gLinear = gammaExpand(g);
  const bLinear = gammaExpand(b);

  // Calculate linear luminance
  const yLinear = 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;

  // Gamma compression function
  const gammaCompress = (Ylinear: number): number => {
      if (Ylinear <= 0.0031308) {
          return Ylinear * 12.92;
      } else {
          return 1.055 * Math.pow(Ylinear, 1 / 2.4) - 0.055;
      }
  };

  // Compress the calculated linear luminance to sRGB
  const ySrgb = gammaCompress(yLinear);

  return ySrgb;
}

