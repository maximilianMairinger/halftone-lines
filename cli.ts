import { $, file, write } from "bun"
import fs from "fs/promises"
import path from "path"
import { decode, encode } from "fast-png"
import { convolution2D, decodeRGBPngToBwMatrix, downsampleBWImage, encodeBWPngFromMatrix, invertImage, makeWhiteOffWhite, openTmpFolder } from "./util"
import sani from "sanitize-against"

const inpPath = Bun.argv[2]
sani(String)(inpPath, "input path invalid")

const inpBaseName = path.basename(inpPath, path.extname(inpPath))
const imageBinary = await file(inpPath).bytes()
let img = decodeRGBPngToBwMatrix(imageBinary)
const ogImg = img


const kernel1 = [
  [0, -1, 0],
  [-1, 4, -1],
  [0, -1, 0]
]

const kernel2 = [
  [0, 0, -1, 0, 0],
  [0, -1, -1, -1, 0],
  [-1, -1, 12, -1, -1],
  [0, -1, -1, -1, 0],
  [0, 0, -1, 0, 0],
]


const kernel3 = [
  [1, 0, -1],
  [1, 0, -1],
  [1, 0, -1]
]

const kernel4 = [
  [1, 1, 1],
  [0, 0, 0],
  [-1, -1, -1]
]

const tmpLocalPath = "tmp"
const tmpFile = await openTmpFolder(tmpLocalPath, {commonName: inpBaseName, ext: "png", numerate: true})

await tmpFile("bw").writeImg(img, true)
img = downsampleBWImage(img, 2**3)
// await tmpFile("downsampled").writeImg(img, true)
img = convolution2D(img, kernel1)
await tmpFile("convolution2D").writeImg(img, true)
img = invertImage(img)
// await tmpFile("invertImage").writeImg(img, true)
img = makeWhiteOffWhite(img)
// await tmpFile("makeWhiteOffWhite").writeImg(img, true)



// const preParsedImg = await tmpFile("preParsedImg").writeImg(img)


// // this is because halftone_lines_cmd outputs into 
// const outPathFromHalftoneScript = `out-${tmpLocalPath}`
// await fs.rmdir(outPathFromHalftoneScript, {recursive: true})
// await fs.mkdir(outPathFromHalftoneScript)
// await $`cd ${tmpLocalPath} && python3 ../halftone_lines_cmd.py ${preParsedImg.free()} --kernel 100 --angle 40`


// await tmpFile.cleanup()