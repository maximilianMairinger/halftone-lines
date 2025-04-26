import { tmpFile } from "./cli"
import { abs, clearNaN, degToRad, max, sum } from "./util"
import clone from "circ-clone"



export function repeat<T>(what: T, n: number) {
  const arr = []
  for (let i = 0; i < n; i++) {
    arr.push(what)
  }
  return arr as T[]
}


export function quantizeHalftoneImg(img: number[][], angleDegree: number, weighting_lineHeight: number[] | number) {
  const weighting = typeof weighting_lineHeight === "number" ? repeat(1, weighting_lineHeight) : weighting_lineHeight


  img = img.map((row) => row.map((v) => v))

  const lineHeight = weighting.length
  const height = img.length
  const width = img[0].length

  const lineHeightAtAngleY = lineHeight / Math.sin(degToRad(90 - angleDegree))  // confirmed
  const lineHeightAtAngleX = lineHeight / Math.cos(degToRad(90 - angleDegree)) // confirmed

  

  const centerPoint = [width / 2, height / 2]
  const centerLineOffsetYAtLeftBorder = (width / 2) / Math.tan(degToRad(90 - angleDegree)) // confirmed
  const centerLineOffsetXAtTopBorder = (height / 2) * Math.tan(degToRad(angleDegree)) // pretty sure
  
  const heightOfMiddleLine = (height / 2 + centerLineOffsetYAtLeftBorder)


  const nTimesUp = heightOfMiddleLine / lineHeightAtAngleY

  
  
  const kernelBeginPoint = (heightOfMiddleLine) - Math.floor(nTimesUp) * lineHeightAtAngleY


  // applyKernelWithAutoPadding

  const angledKernel = createAngledKernel(angleDegree, Math.ceil(Math.sqrt(lineHeight**2/2)))

  
  

  const nLines = height / lineHeightAtAngleY + width / lineHeightAtAngleX

  let densityLines = []

  for (let line = 0; line < nLines; line++) {
    let x = -angledKernel.length // this seems wrong, shouldnt it be Math.max(...abs(angledKernel))
    const initY = Math.round(kernelBeginPoint + lineHeightAtAngleY * line)
    let y = initY
    const yIncGenerator = angleBasedIncrement(angleDegree)

    const densityLine = []
    densityLines.push(densityLine)
    let nNan = 0

    while (y + angledKernel.length >= 0 && x - Math.max(...abs(angledKernel)) < width) {
      const values = clearNaN(angledKernel.map((offset, i) => {
        const ret = (img[y + i]?.[x + offset] ?? NaN) * weighting[i]
        if (!isNaN(ret)) {
          if (img[y + i]) img[y + i][x + offset] = .8
          if (img[y + i]) if (i === 0) img[y + i][x + offset] = .3
        }
        
        return ret
      }))

      const avg = sum(values) / values.length
      if (!isNaN(avg)) densityLine.push(avg)
      else nNan++


      x++
      y = initY - yIncGenerator.next().value
    }

    // console.log("line", line, densityLine.length)

  }

  const longestLine = max(densityLines.map((line) => line.length))
  // sig(wink) * hypo = gegen
  // cos(angle) * hypo = anka
  const maxHeightLine = Math.sin(degToRad(angleDegree)) * longestLine
  const maxWidthLine = Math.cos(degToRad(angleDegree)) * longestLine

  const realHeight = img.length
  const realWidth = img[0].length

  // console.log({
  //   longestLine,
  //   maxHeightLine,
  //   maxWidthLine,
  //   realHeight,
  //   realWidth
  // })

  // densityLines = densityLines.map((line) => {
  //   if (line.length > realHeight || line.length > realWidth) {
  //     console.log("clamping")
  //     line.length = Math.min(realHeight, realWidth)
  //   }
  //   return line
  // })




  tmpFile("densityLines").writeImg(img).free()


  
  return {quantization: densityLines, sensingOvershoot: Math.max(0, longestLine - realWidth)}

  // console.log("nLines", nLines)
  // for (let line = 0; line < nLines; line++) {
    
    
  // }
}





export function vectorizeQuantizationOfHalftoneImage(quantizedImage: number[][],
  {
    angleDegree, maxAmplitude, noiseFrequency = 1, amplitudeScale = 1, moveBackAndForth = false, margin = 0, imageHeight, sensingOvershoot = 0
  }: 
  {
    angleDegree: number,
    maxAmplitude: number,
    noiseFrequency?: number,
    amplitudeScale?: number,
    moveBackAndForth?: boolean,
    margin?: number | [number, number],
    imageHeight: number,
    sensingOvershoot?: number
  }
) {
  const lineHeight = maxAmplitude
  const lineHeightAtAngleY = lineHeight / Math.sin(degToRad(90 - angleDegree)) 
  const lineHeightAtAngleX = lineHeight / Math.cos(degToRad(90 - angleDegree))



  let viewBoxHeight = 0
  let viewBoxWidth = 0



  let paths = []
  let beforeSwitchN = 0
  let staggeringSwitchN = 0

  const maxRowLen = Math.max(...quantizedImage.map((row) => row.length))
  for (let rowI = 0; rowI < quantizedImage.length; rowI++) {
    const row = quantizedImage[rowI]
    if (row.length === 0) continue

    const path = [] as Point[]
    paths.push(path)
    
    let xOffset = 0
    let y: number

    const rowN = rowI + 1

    
    // the thing with the sensing overshoot is just my best guess, It may be wrong haha
    if (rowN * lineHeightAtAngleY < imageHeight + Math.cos(degToRad(angleDegree)) * sensingOvershoot) {
      y = rowN * lineHeightAtAngleY
    }
    else {
      y = imageHeight + Math.cos(degToRad(angleDegree)) * sensingOvershoot
      
      const rowsUsedForHeight = (imageHeight + Math.cos(degToRad(angleDegree)) * sensingOvershoot) / lineHeightAtAngleY
      xOffset = (rowN - rowsUsedForHeight) * lineHeightAtAngleX
    }


    
    for (let x = 0; x < row.length; x += noiseFrequency**-1) {
      const pixelIndex = Math.floor(x)
      
      

      const lightnessValueInv = row[pixelIndex]
      const lightnessValue = 1 - lightnessValueInv

      const noise = Math.random() * 2 - 1
      let noiseWeighted = noise * lightnessValue**2 * maxAmplitude / 2 * amplitudeScale
      // close to 0 should be 0
      if (Math.abs(noiseWeighted) < maxAmplitude / 10) noiseWeighted = 0

      
      // viewbox calc is still wrong, we need to account for the angle. But for gcode gen this doesnt matter
      const point = [x / Math.cos(degToRad(angleDegree)) + xOffset, y + noiseWeighted] as const
    
      viewBoxWidth = Math.max(viewBoxWidth, point[0])
      viewBoxHeight = Math.max(viewBoxHeight, point[1])

      path.push(point)
    }
  }

  const marg = typeof margin === "number" ? [margin, margin] : margin

  paths = paths.map((path) => {
    return path.map((point: Point) => {
      return [
        point[0] + marg[0],
        point[1] - marg[1]
      ]
    })
  })

  // reduce paths: if line is flat dont add points for nothing
  const reducedPaths = []
  let skipping = 0
  for (const path of paths) {
    const reducedPath = [path[0]]
    reducedPaths.push(reducedPath)
    let lastSlope = NaN
    for (let i = 1; i < path.length-1; i++) {
      const thisSlope = path[i][1] - path[i - 1]?.[1]
      if (Math.abs(thisSlope - lastSlope) > 0.000001) {
        reducedPath.push(path[i])
      }
      else {
        skipping++
      }
      lastSlope = thisSlope
    }
    reducedPath.push(path[path.length-1])
  }
  paths = reducedPaths
  console.log("reducing path by", skipping, "nodes")

  if (moveBackAndForth) {
    paths = paths.map((path: number[], i) => {
      const forth = i % 2 === 0
      return forth ? path : path.slice().reverse() 
    })
  } 

  const pathStr = paths.map((path, nPath) => {
    const commands = path.map(([x, y], i) => {
      if (i === 0) {
        return `M ${x.toFixed(5)},${y.toFixed(2)}`;
      }
      return `L ${x.toFixed(5)},${y.toFixed(2)}`;
    })
    
    const forth = !moveBackAndForth || nPath % 2 === 0
    return `<path id="Path_${nPath}" stroke-width="0.3" transform="rotate(${-angleDegree}deg, ${path[forth ? 0 : path.length-1].join(", ")})" d="${commands.join(' ')}" stroke="black" fill="none"/>`;
  })

  const svg = 
`<svg viewBox="0 0 ${viewBoxWidth.toFixed(2)} ${viewBoxHeight.toFixed(2)}" xmlns="http://www.w3.org/2000/svg">
  ${pathStr.join('\n  ')}
</svg>`

  return svg

}





type Point = readonly [number, number];

// await tmpFile("end").writeImg(img)







// await tmpFile.cleanup()



/**
 * Creates a vertical kernel-like structure with relative pixel offsets based on angle
 * @param angleDegrees - Angle in degrees that controls the skew direction
 * @param size - Height of the kernel in pixels (must be a positive integer)
 * @returns Array of horizontal offsets for each vertical position
 */
export function createAngledKernel(angleDegrees: number, size: number): number[] {
  // Convert angle to radians
  const angleRadians: number = angleDegrees * Math.PI / 180;
  
  // Calculate tangent of the angle
  const tangent: number = Math.tan(angleRadians);
  
  // Calculate the center of the kernel
  const center: number = (size - 1) / 2;
  
  // Create kernel
  const kernel: number[] = [];
  
  for (let y: number = 0; y < size; y++) {
    // Calculate horizontal offset based on angle
    const xOffset: number = tangent * (y - center);
    
    // Round to nearest integer (as we're dealing with pixels)
    kernel.push(Math.round(xOffset));
  }
  
  return kernel;
}


/**
 * Generator that produces a sequence of x-offsets based on y-increments at a given angle
 * @param angleDegrees - Angle in degrees that controls horizontal progression
 * @yields The x position as y increases by 1 each step
 */
export function* angleBasedIncrement(angleDegrees: number, initVal = 0): Generator<number> {
  // Convert angle to radians
  const angleRadians = angleDegrees * Math.PI / 180;
  
  // Calculate how much x changes when y increases by 1
  const dx = Math.tan(angleRadians);
  
  // Starting position
  let exactX = 0;
  
  // For each y-increment
  let y = 0;
  while (true) {
    // Calculate exact x position based on current y
    exactX = dx * y;
    
    // Round to get the pixel position
    yield Math.round(exactX + initVal);
    
    // Move to next y position
    y++;
  }
}




