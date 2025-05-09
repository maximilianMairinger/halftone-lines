import { $, file, write } from "bun"
import fs from "fs/promises"
import path from "path"
import { decode, encode } from "fast-png"
import { centerIrregularImageOnDiagonal, convolution2D, decodeRGBPngToBwMatrix, downsampleBWImage, encodeBWPngFromMatrix, invertImage, kernel1d, makeWhiteOffWhite, openTmpFolder } from "./util"
import sani from "sanitize-against"
import { optimize } from 'svgo';
import { quantizeHalftoneImg, vectorizeQuantizationOfHalftoneImage } from "./toPath"
import timoi from "timoi"

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




// config
const tmpLocalPath = "tmp"
const edgeDetectionKernel = kernel2
const halftoneKernelSize = 10
const halftoneAngle = 40
const downSampleBitrate = 6
const noiseFrequency = 1.5
const amplitudeScale = 5
const margin = 100
const gCodeFeedRate = 3500

// assumed from halftone_lines_cmd
const assumedLineHeight = 20


console.log(`Starting with options`)
console.table({
  halftoneKernelSize,
  halftoneAngle,
  downSampleBitrate,
  // lineSpacing,
  noiseFrequency,
  amplitudeScale,
  margin,
  gCodeFeedRate
})

export const tmpFile = await openTmpFolder(tmpLocalPath, {commonName: inpBaseName, defaultExt: "png", numerate: true})

const totalTimer = timoi("total")
const preprocessingTimer = timoi("preprocessing")
await tmpFile("bw").writeImg(img).free()
img = downsampleBWImage(img, downSampleBitrate)
await tmpFile("downsampled").writeImg(img).free()
img = convolution2D(img, edgeDetectionKernel)
await tmpFile("convolution2D").writeImg(img).free()
img = invertImage(img)
await tmpFile("invertImage").writeImg(img).free()
img = makeWhiteOffWhite(img)
await tmpFile("makeWhiteOffWhite").writeImg(img).free()



const preParsedImg = await tmpFile("preParsedImg").writeImg(img)

preprocessingTimer()

const halftoneifyTimer = timoi("halftoneify")

await $`cd ${tmpLocalPath} && python3 ../halftone_lines_cmd.py ${preParsedImg.fileName} --kernel ${halftoneKernelSize} --angle ${halftoneAngle} --no-verbose`
preParsedImg.free()

halftoneifyTimer()

const halftoneOutFilePath = `${tmpLocalPath}/out-${preParsedImg.fileName}` // it cannot be changed and is this weird...
const halfTonedImg = await tmpFile("halfToned").write(await fs.readFile(halftoneOutFilePath))
await fs.unlink(halftoneOutFilePath)


img = decodeRGBPngToBwMatrix(await halfTonedImg.read().bytes())
halfTonedImg.free()


const quanitzationTimer = timoi("quantization")
const { quantization, sensingOvershoot } = quantizeHalftoneImg(img, halftoneAngle, assumedLineHeight)
await tmpFile("quantization").writeImg(centerIrregularImageOnDiagonal(quantization)).free()
quanitzationTimer()

console.log("sensingOvershoot", sensingOvershoot)

const vectorizationTimer = timoi("vectorization")
const rawSvg = vectorizeQuantizationOfHalftoneImage(quantization, {
  angleDegree: halftoneAngle,
  maxAmplitude: assumedLineHeight,
  noiseFrequency,
  amplitudeScale,
  moveBackAndForth: true,
  margin,
  imageHeight: img.length,
  sensingOvershoot
})

vectorizationTimer()

tmpFile("svgRaw.svg").write(rawSvg)


const svgOptTimer = timoi("svg opt")
// Optimize SVG with SVGO using common defaults
const optimizedSvg = optimize(rawSvg, {
  multipass: true, // Apply optimizations multiple times for better results
  plugins: [
    'preset-default', // Contains most common optimizations
    'removeDimensions', // Remove width/height when viewBox exists
    'sortAttrs', // Sort element attributes for better gzip compression
    'removeOffCanvasPaths' // Remove paths outside viewBox
  ]
});

svgOptTimer()

// Save the optimized SVG
const svgOpt = await tmpFile("svgOptimized.svg").write(optimizedSvg.data);

const gCodeGenTimer = timoi("gcode generation")
const gocodeFile = tmpFile("gocode.gcode")
// 25.4 may be important dunno where it comes from anymore
await $`svg2gcode/target/release/svg2gcode ${svgOpt.free()} -o ${gocodeFile.filePath} --feedrate ${gCodeFeedRate} --dpi ${25.4 * 5}`

gCodeGenTimer()



console.log(`---- Done (took ${totalTimer.str()}) ----`)
