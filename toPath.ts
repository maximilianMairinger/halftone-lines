import { assumedLineHeight } from "./cli"
import { abs, clearNaN, degToRad, max, sum } from "./util"




export function repeat<T>(what: T, n: number) {
  const arr = []
  for (let i = 0; i < n; i++) {
    arr.push(what)
  }
  return arr as T[]
}


export function quantizeHalftoneImg(img: number[][], angleDegree: number, weighting = repeat(1, assumedLineHeight)) {
  // if (weighting.length !== assumedLineHeight) throw new Error("weighting length must be equal to assumedLineHeight " + assumedLineHeight)
  const height = img.length
  const width = img[0].length

  const lineHeight = assumedLineHeight
  const lineHeightAtAngleY = lineHeight / Math.sin(degToRad(90 - angleDegree))  // confirmed
  const lineHeightAtAngleX = lineHeight / Math.cos(degToRad(90 - angleDegree)) // confirmed

  

  const centerPoint = [width / 2, height / 2]
  const centerLineOffsetYAtLeftBorder = (width / 2) / Math.tan(degToRad(90 - angleDegree)) // confirmed
  const centerLineOffsetXAtTopBorder = (height / 2) * Math.tan(degToRad(angleDegree)) // pretty sure
  
  const heightOfMiddleLine = (height / 2 + centerLineOffsetYAtLeftBorder)


  const nTimesUp = heightOfMiddleLine / lineHeightAtAngleY

  
  
  const kernelBeginPoint = (heightOfMiddleLine) - Math.floor(nTimesUp) * lineHeightAtAngleY


  // applyKernelWithAutoPadding

  const angledKernel = createAngledKernel(angleDegree, Math.ceil(Math.sqrt(assumedLineHeight**2/2)))

  
  

  const nLines = height / lineHeightAtAngleY + width / lineHeightAtAngleX

  const densityLines = []

  for (let line = 0; line < nLines; line++) {
    let x = -angledKernel.length
    const initY = Math.round(kernelBeginPoint + lineHeightAtAngleY * line)
    let y = initY
    const yIncGenerator = angleBasedIncrement(angleDegree)

    const densityLine = []
    densityLines.push(densityLine)

    while (y + angledKernel.length >= 0 && x - Math.max(...abs(angledKernel)) < width) {
      const values = clearNaN(angledKernel.map((offset, i) => {
        const ret = (img[y + i]?.[x + offset] ?? NaN) * weighting[i]
        if (img[y + i]) img[y + i][x + offset] = .8
        if (img[y + i]) if (i === 0) img[y + i][x + offset] = .3
        return ret
      }))

      const avg = sum(values) / values.length
      if (!isNaN(avg)) densityLine.push(avg)


      x++
      y = initY - yIncGenerator.next().value
    }

  }


  
  return densityLines

  // console.log("nLines", nLines)
  // for (let line = 0; line < nLines; line++) {
    
    
  // }
}





export function vectorizeQuantizationOfHalftoneImage(
  quantizedImage: number[][],
  angleDegree: number = 40,
  maxAmplitude: number = 20,
  lineSpacing: number = 10,
  noiseFrequency: number = 10,
  amplitudeScale: number = 1
) {
  const lineHeight = maxAmplitude + Math.sqrt(2 * lineSpacing**2) 
  const lineHeightAtAngleY = lineHeight / Math.sin(degToRad(90 - angleDegree)) 
  const lineHeightAtAngleX = lineHeight / Math.cos(degToRad(90 - angleDegree))



  let viewBoxHeight = 0
  let viewBoxWidth = 0



  const paths = []

  
  for (let rowI = 0; rowI < quantizedImage.length; rowI++) {
    const row = quantizedImage[rowI]
    if (row.length === 0) continue

    const path = [] as Point[]
    paths.push(path)
    
    let xOffset = 0
    let y: number
    // this only works for rectangular images...
    if (rowI <= quantizedImage.length / 2) {
      y = (rowI + 1) * lineHeightAtAngleY / 2
    }
    else {
      y = (quantizedImage.length / 2 + 1) * lineHeightAtAngleY / 2
      xOffset = lineHeightAtAngleX * (rowI - quantizedImage.length / 2) / 2
    }

    for (let x = 0; x < row.length; x += noiseFrequency**-1) {
      const pixelIndex = Math.floor(x)

      const lightnessValueInv = row[pixelIndex]
      const lightnessValue = 1 - lightnessValueInv

      const noise = Math.random() * 2 - 1
      const noiseWeighted = noise * lightnessValue * maxAmplitude / 2

      const point = [x + xOffset, y + noiseWeighted * amplitudeScale] as const
      // let lastViewBoxWidth = viewBoxWidth
      viewBoxWidth = Math.max(viewBoxWidth, point[0])
      viewBoxHeight = Math.max(viewBoxHeight, point[1])
      // if (viewBoxWidth !== lastViewBoxWidth && viewBoxWidth > 220) {
      //   console.log("hello=")
      //   console.log("point", point)
      //   console.log("rowI", rowI)
      //   console.log("x", x)
      //   console.log("pixelIndex", pixelIndex)
      // }
      
      path.push(point)
    }
  }

  const pathStr = paths.map((path, nPath) => {
    const commands = path.map(([x, y], i) => {
      if (i === 0) {
        return `M ${x.toFixed(5)},${y.toFixed(5)}`;
      }
      return `L ${x.toFixed(5)},${y.toFixed(5)}`;
    })
    
    return `<path name="Path_${nPath}" stroke-width="0.3" transform="rotate(${-angleDegree}deg, ${path[0].join(", ")})" d="${commands.join(' ')}" stroke="black" fill="none"/>`;
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




