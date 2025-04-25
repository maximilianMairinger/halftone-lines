/**
 * Generator that produces a sequence of x-offsets based on y-increments at a given angle
 * @param angleDegrees - Angle in degrees that controls horizontal progression
 * @yields The x position as y increases by 1 each step
 */
function* angleBasedIncrement(angleDegrees: number): Generator<number> {
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
    yield Math.round(exactX);
    
    // Move to next y position
    y++;
  }
}



// Create a generator with 45-degree angle
const increment = angleBasedIncrement(80);

// Get the first several values
console.log(increment.next().value); // 0
console.log(increment.next().value); // 1
console.log(increment.next().value); // 2
console.log(increment.next().value); // 3
console.log(increment.next().value); // 0
console.log(increment.next().value); // 1
console.log(increment.next().value); // 2
console.log(increment.next().value); // 3
console.log(increment.next().value); // 0
console.log(increment.next().value); // 1
console.log(increment.next().value); // 2
console.log(increment.next().value); // 3
console.log(increment.next().value); // 0
console.log(increment.next().value); // 1
console.log(increment.next().value); // 2
console.log(increment.next().value); // 3
console.log(increment.next().value); // 0
console.log(increment.next().value); // 1
console.log(increment.next().value); // 2
console.log(increment.next().value); // 3