let video;
let handPose;
let hands = [];
let stableRightHand = null;
let stableLeftHand = null;
let stableRightWrist = null;
let stableLeftWrist = null;
let painting;
let paintingHistory = [];
let paintingFadeTarget = null;
let paintingFadeStartTime = 0;
let paintingFadeDuration = 520;
let undoFadeLayer = null;
let undoFadeStartTime = 0;
let currentStroke = [];
let trail = [];
let trailLength = 25;
let savedSegments = [];

let cursorX = 0;
let cursorY = 0;
let smoothX = 0;
let smoothY = 0;

let isDrawing = false;
let wasDrawing = false;
let drawingWasUndoPinching = false;
let drawingWasClearPinching = false;

let symmetry = 8;
let pointSpacing = 2;

let colors = [];
let selectedColor;
let selectedColorIndex = 0;

let leftWasPinching = false;

let lastPinchTime = 0;
let pinchGraceTime = 50;

let pinchStartTime = 0;
let pinchHoldTime = 100;

let cursorSmoothing = 0.08;
let smoothCursorSize = 30;


// ==================================================
// THREADS
// ==================================================

let threadStrokes = [];
let activeThread = null;

let THREAD_START_LIFE = 180;
let THREAD_START_OPACITY = 0.075;
let THREAD_DRAWS_PER_FRAME = 2;

let THREAD_FRICTION = 0.975;
let THREAD_RIGIDITY = 0.20;
let THREAD_RESTING_DISTANCE = 1.8;

let THREAD_NOISE_FORCE = 1.0;
let THREAD_NOISE_SPACE = 0.02;
let THREAD_NOISE_TIME = 0.005;
let THREAD_NOISE_ANGLE = 5 * Math.PI;

let THREAD_INITIAL_VELOCITY = 0.3;
let THREAD_VELOCITY_DECAY = 0.98;

let THREAD_LINE_WIDTH = 1.0;

let titleAnimationStarted = false;
let titleAnimationStartTime = 0;
let titleAnimationCycle = -1;
let titleAnimationColor = null;
let TITLE_DRAW_TIME = 5200;
let TITLE_FADE_TIME = 2200;
let TITLE_CYCLE_TIME = TITLE_DRAW_TIME + TITLE_FADE_TIME;


// ==================================================
// SYMMETRY
// ==================================================

let symmetryMirror = true;


// ==================================================
// COLLISION
// ==================================================

let grid = new Map();

let gridSize = 60;
let collisionDistance = 4;

let pullStrength = 3;

let pulledSegments = [];


// ==================================================
// AUDIO
// ==================================================

let audioFile = null;
let musicVolume = 0.2;

let audioContext = null;
let audioSource = null;
let audioAnalyser = null;
let audioData = null;

let audioStarted = false;
let experienceStarted = false;

// The tutorial sets this to "right" or "left".
// The physical hand is then mapped to the appropriate control set.
let userHandedness = "right";

let audioBass = 0;
let audioMid = 0;
let audioHigh = 0;
let audioBeat = 0;

let audioEnergyAverage = 0;
let audioPulse = 0;
let previousAudioPulse = 0;
let audioWaveRadii = new Array(8).fill(2.0);
let audioWaveStrengths = new Array(8).fill(0);
let maxAudioWaves = 8;
let leftMapCenterX = 0.5;
let leftMapCenterY = 0.5;
let leftHandProximity = 1.0;

let audioTime = 0;

let displacementLayer = null;
let displacementShader = null;

let displacementVertexShader = `
precision mediump float;

attribute vec3 aPosition;
attribute vec2 aTexCoord;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

varying vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;
  gl_Position =
    uProjectionMatrix *
    uModelViewMatrix *
    vec4(aPosition, 1.0);
}
`;

let displacementFragmentShader = `
precision mediump float;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uPulse;
uniform float uAspect;
uniform float uWaveRadii[8];
uniform float uWaveStrengths[8];
uniform vec2 uMapCenter;
uniform float uHandProximity;

varying vec2 vTexCoord;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);

  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));

  return mix(
    mix(a, b, local.x),
    mix(c, d, local.x),
    local.y
  );
}
void main() {
  vec2 uv = vTexCoord;
  vec2 centered = uv - uMapCenter;
  centered.x *= uAspect;

  float radius = length(centered);
  float angle = atan(centered.y, centered.x);

  float audioEnergy =
    uBass * 0.65 +
    uMid * 0.25 +
    uHigh * 0.10;

  float lowMotion = max(uBass, 0.35);

  float highMotion =
    clamp(
      uHigh * 0.70 +
      uMid * 0.20 +
      uPulse * 0.30,
      0.0,
      1.0
    );

  float strength =
    0.0040 +
    lowMotion * 0.0020 +
    highMotion * 0.0035;

  float flowA =
    noise(vec2(
      radius * 5.0 + uTime * 0.08,
      angle * 2.0 - uTime * 0.06
    ));

  float flowB =
    noise(vec2(
      radius * 8.0 - uTime * 0.05,
      angle * 3.0 + uTime * 0.08
    ));

  vec2 radial =
    centered /
    max(radius, 0.001);

  vec2 tangent = vec2(
    -radial.y,
    radial.x
  );

  float outwardWave = 0.0;

  for (int waveIndex = 0; waveIndex < 8; waveIndex++) {
    float waveDistance =
      radius -
      uWaveRadii[waveIndex];

    float waveBand =
      exp(
        -waveDistance *
        waveDistance /
        0.014
      );

    float trailDistance =
      max(
        uWaveRadii[waveIndex] -
        radius,
        0.0
      );

    float waveTrail =
      exp(
        -trailDistance *
        2.8
      ) *
      uWaveStrengths[waveIndex] *
      0.55;

    outwardWave = max(
      outwardWave,
      max(
        waveBand *
        uWaveStrengths[waveIndex],
        waveTrail
      )
    );
  }

  float swirl =
    cos(
      radius * 10.0 +
      uTime * 0.25 +
      flowB * 2.0
    );

  float centerDamping =
    smoothstep(
      0.08,
      0.24,
      radius
    );

  vec2 displacement = radial * outwardWave * (0.18 + highMotion * 0.82);

  vec2 evolutionDisplacement =
    tangent *
    swirl *
    (0.35 + lowMotion * 0.60);

  float evolutionWiggle =
    sin(
      uTime * 0.65 +
      flowA * 2.5 +
      angle * 1.5
    );

  evolutionDisplacement +=
    tangent *
    evolutionWiggle *
    0.50;

  evolutionDisplacement *=
    centerDamping *
    1.50 *
    uHandProximity;

  displacement += evolutionDisplacement;

  displacement +=
    tangent *
    sin(uTime * 0.8 + flowB * 2.0) *
    lowMotion *
    0.34 *
    centerDamping *
    1.50 *
    uHandProximity;

  displacement *= strength;

  vec4 displacedColor = texture2D(
    uTexture,
    clamp(uv + displacement, 0.001, 0.999)
  );

  float lowBrightness =
    lowMotion *
    0.05;

  float highBrightness =
    highMotion *
    0.08 +
    outwardWave *
    1.10;

  float brightness =
    1.0 +
    lowBrightness +
    highBrightness +
    uPulse *
    0.12;

  gl_FragColor = vec4(
    displacedColor.rgb * brightness,
    displacedColor.a
  );
}
`;


// ==================================================
// AUDIO START
// ==================================================

async function startAudio() {

  try {

    if (!audioFile) {

      audioFile =
        new Audio( "./audio/entanglement.mp3");

      audioFile.preload = "auto";
      audioFile.loop = true;
      audioFile.volume = musicVolume;
      audioFile.playsInline = true;

    }


    if (!audioContext) {

      let AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

      audioContext = new AudioContext();

    }


    if (
      audioContext.state !== "running"
    ) {

      await audioContext.resume();

    }


    if (!audioAnalyser) {

      audioAnalyser = audioContext.createAnalyser();

      audioAnalyser.fftSize = 1024;

      audioAnalyser.minDecibels = -90;

      audioAnalyser.maxDecibels = -10;

      audioAnalyser.smoothingTimeConstant = 0.65;

      audioData =
        new Uint8Array( audioAnalyser.frequencyBinCount);

    }


    if (!audioSource) {

      audioSource =
        audioContext.createMediaElementSource( audioFile);

      audioSource.connect( audioAnalyser);

      audioAnalyser.connect( audioContext.destination);

    }


    await audioFile.play();

    audioStarted = true;

  }

  catch (error) {

    console.error(
      "Audio failed to start:",
      error
    );

  }

}


// ==================================================
// AUDIO BAND
// ==================================================

function getAudioBand(
  lowHz,
  highHz
) {

  if (
    !audioContext ||
    !audioAnalyser ||
    !audioData
  ) {

    return 0;

  }


  let nyquist = audioContext.sampleRate / 2;


  let low =
    floor(
      map(
        lowHz,
        0,
        nyquist,
        0,
        audioData.length - 1
      )
    );


  let high =
    floor(
      map(
        highHz,
        0,
        nyquist,
        0,
        audioData.length - 1
      )
    );


  low =
    constrain(
      low,
      0,
      audioData.length - 1
    );


  high =
    constrain(
      high,
      low,
      audioData.length - 1
    );


  let total = 0;


  for (
    let i = low;
    i <= high;
    i++
  ) {

    total += audioData[i];

  }


  return (
    total /
    (high - low + 1) /
    255
  );

}


// ==================================================
// AUDIO UPDATE
// ==================================================

function updateAudio() {

  if (
    !audioStarted ||
    !audioAnalyser ||
    !audioData
  ) {

    return;

  }


  audioAnalyser.getByteFrequencyData( audioData);


  let bass =
    getAudioBand(
      45,
      160
    );


  let mid =
    getAudioBand(
      160,
      1200
    );


  let high =
    getAudioBand(
      1200,
      5000
    );


  bass =
    pow(
      bass,
      0.72
    );


  mid =
    pow(
      mid,
      0.78
    );


  high =
    pow(
      high,
      0.82
    );


  audioBass =
    lerp(
      audioBass,
      bass,
      0.08
    );


  audioMid =
    lerp(
      audioMid,
      mid,
      0.10
    );


  audioHigh =
    lerp(
      audioHigh,
      high,
      0.12
    );


  let energy =
    audioBass * 0.68 +
    audioMid * 0.25 +
    audioHigh * 0.07;


  audioEnergyAverage =
    lerp(
      audioEnergyAverage,
      energy,
      0.018
    );


  let targetBeat =
    constrain(
      (
        energy - 0.10
      ) / 0.50,
      0,
      1
    );


  audioBeat =
    lerp(
      audioBeat,
      targetBeat,
      targetBeat > audioBeat
        ? 0.20
        : 0.055
    );


  let rise =
    energy -
    audioEnergyAverage;


  let targetPulse =
    constrain(
      rise * 10.0,
      0,
      1
    );


  audioPulse =
    max(
      targetPulse,
      audioPulse * 0.91
    );


  if (
    audioPulse > 0.20 &&
    audioPulse >
    previousAudioPulse +
    0.01
  ) {

    audioWaveRadii.push( 0);

    audioWaveStrengths.push(
      constrain(
        audioPulse +
        audioHigh * 0.45,
        0,
        1
      )
    );

    if (
      audioWaveRadii.length >
      maxAudioWaves
    ) {

      audioWaveRadii.shift();
      audioWaveStrengths.shift();

    }

  }


  for (
    let waveIndex = 0;

    waveIndex <
    audioWaveRadii.length;

    waveIndex++
  ) {

    audioWaveRadii[waveIndex] +=
      min(
        deltaTime,
        40
      ) *
      0.001 *
      (
        0.42 +
        audioHigh *
        0.35
      );


    audioWaveStrengths[waveIndex] *= 0.996;

  }


  previousAudioPulse = audioPulse;


  audioTime +=
    min(
      deltaTime,
      40
    ) *
    0.001;

}


// ==================================================
// LIVE AUDIO BRIGHTNESS
// ==================================================

function drawAudioReactivePainting() {

  if (
    !audioStarted
  ) {

    return;

  }


  let audioLevel =
    constrain(

      audioBass * 0.60 +
      audioMid * 0.30 +
      audioHigh * 0.10,

      0,
      1

    );


  /*
   * The painting itself never changes.
   *
   * We simply redraw it using SCREEN blending.
   * This means old lines can become brighter
   * or darker in real time as the music changes.
   */


let screenStrength =
  pow(
    constrain(audioLevel / 0.65, 0, 1),
    2.8
  ) * 0.95;


  if (
    screenStrength <= 0.001
  ) {

    return;

  }


  push();


  let ctx = drawingContext;


  ctx.save();


  ctx.globalCompositeOperation = "screen";


  ctx.globalAlpha = screenStrength;


  drawAudioDisplacement();


  ctx.restore();


  pop();

}


function drawAudioDisplacement() {

  if (
    !displacementLayer ||
    !displacementShader
  ) {

    return;

  }


  displacementLayer.clear();

  displacementLayer.shader( displacementShader);

  displacementShader.setUniform(
    "uTexture",
    painting
  );

  displacementShader.setUniform(
    "uTime",
    millis() *
    0.001
  );

  displacementShader.setUniform(
    "uBass",
    audioBass
  );

  displacementShader.setUniform(
    "uMid",
    audioMid
  );

  displacementShader.setUniform(
    "uHigh",
    audioHigh
  );

  displacementShader.setUniform(
    "uPulse",
    audioPulse
  );

  displacementShader.setUniform(
    "uAspect",
    width /
    height
  );

  displacementShader.setUniform(
    "uWaveRadii",
    audioWaveRadii
  );

  displacementShader.setUniform(
    "uWaveStrengths",
    audioWaveStrengths
  );

  displacementShader.setUniform(
    "uMapCenter",
    [
      leftMapCenterX,
      leftMapCenterY
    ]
  );

  displacementShader.setUniform(
    "uHandProximity",
    leftHandProximity
  );

  displacementLayer.noStroke();

  displacementLayer.rect(
    -width / 2,
    -height / 2,
    width,
    height
  );

  image(
    displacementLayer,
    0,
    0
  );

}


// ==================================================
// TRAIL
// ==================================================

function updateTrail(
  x,
  y
) {

  trail.push({
    x: x,
    y: y
  });


  if (
    trail.length >
    trailLength
  ) {

    trail.shift();

  }

}


function drawTrail() {

  if (
    trail.length < 2
  ) {

    return;

  }


  push();

  noFill();

  stroke( selectedColor);

  strokeWeight( 1);


  beginShape();


  for (
    let point of trail
  ) {

    vertex(
      point.x,
      point.y
    );

  }


  endShape();

  pop();

}


// ==================================================
// SETUP
// ==================================================

async function setup() {

  p5.disableFriendlyErrors = true;


  createCanvas(
    windowWidth,
    windowHeight
  );


  pixelDensity( 1);


  colorMode(
    HSB,
    360,
    100,
    100,
    255
  );


  noiseDetail(
    8,
    0.65
  );


  painting =
    createGraphics(
      windowWidth,
      windowHeight
    );


  painting.pixelDensity( 1);


  painting.colorMode(
    HSB,
    360,
    100,
    100,
    255
  );


  painting.clear();

  paintingHistory = [
    painting.get()
  ];


  displacementLayer =
    createGraphics(
      windowWidth,
      windowHeight,
      WEBGL
    );


  displacementShader =
    displacementLayer.createShader(
      displacementVertexShader,
      displacementFragmentShader
    );


  colors = [

    color(
      195,
      85,
      75
    ),

    color(
      275,
      80,
      72
    ),

    color(
      345,
      90,
      78
    ),

    color(
      18,
      90,
      80
    )

  ];


  selectedColor = colors[0];


  startAudio();

}


async function startExperience() {

  if (
    experienceStarted
  ) {

    return;

  }


  experienceStarted = true;

  titleAnimationStarted = false;

  threadStrokes = [];
  activeThread = null;
  painting.clear();


  await startAudio();


  video =
    createCapture(
      VIDEO,
      {
        flipped: true
      }
    );


  video.size(
    640,
    480
  );


  video.parent( "camera-content");


  ml5.handPose(
    {
      flipped: true
    }
  ).then(
    function(model) {

      handPose = model;


      handPose.detectStart(
        video,
        gotHands
      );

    }
  );

}


function setHandedness(handedness) {

  if (
    handedness !== "left" &&
    handedness !== "right"
  ) {

    return;

  }

  userHandedness = handedness;

  // Reset pinch states when changing control sides.
  isDrawing = false;
  wasDrawing = false;
  drawingWasUndoPinching = false;
  drawingWasClearPinching = false;
  leftWasPinching = false;
  pinchStartTime = 0;

}


function gotHands(results) {
  hands = stabilizeHands(results);
}

function wristOf(hand) {
  return hand && hand.wrist ? { x: hand.wrist.x, y: hand.wrist.y } : null;
}

function wristDistance(a, b) {
  if (!a || !b) return Infinity;
  return dist(a.x, a.y, b.x, b.y);
}

function stabilizeHands(results) {
  if (!results || results.length === 0) {
    stableRightHand = null;
    stableLeftHand = null;
    stableRightWrist = null;
    stableLeftWrist = null;
    return [];
  }

  if (results.length === 1) {
    const hand = results[0];
    const label = hand.handedness;
    const wrist = wristOf(hand);

    if (label === "Right") {
      stableRightHand = hand;
      stableRightWrist = wrist;
      stableLeftHand = null;
      stableLeftWrist = null;
    } else if (label === "Left") {
      stableLeftHand = hand;
      stableLeftWrist = wrist;
      stableRightHand = null;
      stableRightWrist = null;
    }

    return [stableRightHand, stableLeftHand].filter(Boolean);
  }

  // Keep each physical hand attached to its previous position. This prevents
  // the result order (or a temporary handedness label change) from swapping
  // the drawing and colour controls when the second hand enters the camera.
  const remaining = results.slice();
  const assignments = { right: null, left: null };

  if (stableRightWrist) {
    let best = 0, bestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = wristDistance(stableRightWrist, wristOf(remaining[i]));
      const labelPenalty = remaining[i].handedness === "Right" ? 0 : 120;
      if (d + labelPenalty < bestDistance) { best = i; bestDistance = d + labelPenalty; }
    }
    assignments.right = remaining.splice(best, 1)[0];
  }

  if (stableLeftWrist && remaining.length) {
    let best = 0, bestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = wristDistance(stableLeftWrist, wristOf(remaining[i]));
      const labelPenalty = remaining[i].handedness === "Left" ? 0 : 120;
      if (d + labelPenalty < bestDistance) { best = i; bestDistance = d + labelPenalty; }
    }
    assignments.left = remaining.splice(best, 1)[0];
  }

  // Fill any empty slot from the remaining model result, preferring its label.
  for (const hand of remaining) {
    if (!assignments.right && hand.handedness === "Right") assignments.right = hand;
    else if (!assignments.left && hand.handedness === "Left") assignments.left = hand;
  }
  for (const hand of remaining) {
    if (!assignments.right) assignments.right = hand;
    else if (!assignments.left && hand !== assignments.right) assignments.left = hand;
  }

  stableRightHand = assignments.right;
  stableLeftHand = assignments.left;
  stableRightWrist = wristOf(stableRightHand);
  stableLeftWrist = wristOf(stableLeftHand);

  return [stableRightHand, stableLeftHand].filter(Boolean);
}


// ==================================================
// DRAW
// ==================================================

function drawTitleAnimation() {

  if (
    !titleAnimationStarted
  ) {

    titleAnimationStarted = true;

    titleAnimationStartTime = millis();

    titleAnimationCycle = -1;

    threadStrokes = [];
    activeThread = null;
    titleAnimationColor =
      colors[
        floor(random(colors.length))
      ];

    seedTitleThreads();

  }


  let elapsedTime = millis() - titleAnimationStartTime;

  let cycleTime = elapsedTime % TITLE_CYCLE_TIME;

  let currentCycle = floor(elapsedTime / TITLE_CYCLE_TIME);


  if (
    currentCycle !== titleAnimationCycle
  ) {

    threadStrokes = [];
    activeThread = null;
    painting.clear();
    titleAnimationColor =
      colors[
        floor(random(colors.length))
      ];
    seedTitleThreads();

  }


  titleAnimationCycle = currentCycle;

  updateThreadStrokes();


  if (
    cycleTime >= TITLE_DRAW_TIME
  ) {

    let fadeAmount =
      map(
        cycleTime,
        TITLE_DRAW_TIME,
        TITLE_CYCLE_TIME,
        0.015,
        0.12
      );

    painting.push();
    let paintingContext = painting.drawingContext;

    paintingContext.save();
    paintingContext.globalCompositeOperation = "destination-out";
    paintingContext.fillStyle = "rgba(0, 0, 0, " + fadeAmount + ")";
    paintingContext.fillRect(
      0,
      0,
      painting.width,
      painting.height
    );
    paintingContext.restore();
    painting.pop();

  }


  image(
    painting,
    0,
    0
  );

  drawUndoStrokeFade();

}


function seedTitleThreads() {

  let centerX = width * 0.74;

  let centerY = height * 0.5;


  for (
    let i = 0;
    i < 3;
    i++
  ) {

    let angle = random(TWO_PI);

    let radius = random(50, min(width, height) * 0.14);

    let stroke = {
      curve: [],
      color: titleAnimationColor,
      originX: centerX,
      originY: centerY,
      noiseOffset: random(10000),
      time: 0,
      completed: false
    };


    for (
      let pointIndex = 0;
      pointIndex < 18;
      pointIndex++
    ) {

      let pointAngle =
        angle +
        pointIndex * 0.13 +
        sin(pointIndex * 0.6) * 0.18;

      let pointRadius =
        radius +
        pointIndex * 3.2;

      let x = centerX + cos(pointAngle) * pointRadius;

      let y = centerY + sin(pointAngle) * pointRadius;

      stroke.curve.push({
        x: x,
        y: y,
        px: x,
        py: y,
        inputVx: 0,
        inputVy: 0,
        life: THREAD_START_LIFE
      });

    }


    threadStrokes.push( stroke);

  }

}

function draw() {

  updateAudio();


  background( 0);


  if (
    !experienceStarted
  ) {

    drawTitleAnimation();

  }


  let rightHand = null;

  let leftHand = null;


  for (
    let hand of hands
  ) {

    if (
      hand.handedness ===
      "Right"
    ) {

      rightHand = hand;

    }


    if (
      hand.handedness ===
      "Left"
    ) {

      leftHand = hand;

    }

  }


  // Right-handed:
  //   left hand  = colour / reaction
  //   right hand = draw / undo / clear
  //
  // Left-handed:
  //   right hand = colour / reaction
  //   left hand  = draw / undo / clear

  let colourHand =
    userHandedness === "left"
      ? rightHand
      : leftHand;

  let drawingHand =
    userHandedness === "left"
      ? leftHand
      : rightHand;


  if (
    colourHand
  ) {

    selectColour( colourHand);

  }

  else {

    leftMapCenterX =
      lerp(
        leftMapCenterX,
        0.5,
        0.08
      );

    leftMapCenterY =
      lerp(
        leftMapCenterY,
        0.5,
        0.08
      );

    leftHandProximity =
      lerp(
        leftHandProximity,
        1.0,
        0.08
      );

  }


  if (
    drawingHand
  ) {

    handleDrawingHand( drawingHand);

  }

  else {

    if (
      wasDrawing
    ) {

      finishStroke();

    }


    isDrawing = false;

    wasDrawing = false;

    drawingWasUndoPinching = false;

    drawingWasClearPinching = false;

  }


  updateThreadStrokes();

  updatePaintingFade();


  image(
    painting,
    0,
    0
  );


  if (
    audioStarted
  ) {

    drawAudioDisplacement();

  }


  // ==================================================
  // LIVE AUDIO REACTION
  // ==================================================

  drawPulledSegments();


  drawTrail();


  if (
    drawingHand
  ) {

    drawCursor( drawingHand);

  }

}


// ==================================================
// LEFT HAND COLOUR
// ==================================================

function selectColour(
  hand
) {

  let index = hand.index_finger_tip;


  let thumb = hand.thumb_tip;


  let handCenterX =
    (
      index.x +
      thumb.x
    ) *
    0.5;

  let handCenterY =
    (
      index.y +
      thumb.y
    ) *
    0.5;


  let wrist = hand.wrist;

  let middleMcp = hand.middle_finger_mcp;


  if (
    wrist &&
    middleMcp
  ) {

    let palmSize =
      dist(
        wrist.x,
        wrist.y,
        middleMcp.x,
        middleMcp.y
      );


    leftHandProximity =
      lerp(
        leftHandProximity,
        map(
          palmSize,
          35,
          125,
          0.75,
          1.55,
          true
        ),
        0.12
      );

  }


  leftMapCenterX =
    lerp(
      leftMapCenterX,
      constrain(
        handCenterX /
        640,
        0,
        1
      ),
      0.12
    );

  leftMapCenterY =
    lerp(
      leftMapCenterY,
      constrain(
        handCenterY /
        480,
        0,
        1
      ),
      0.12
    );


  let fingerTips = [
    hand.index_finger_tip,
    hand.middle_finger_tip,
    hand.ring_finger_tip,
    hand.pinky_finger_tip
  ];

  let closestFinger = -1;

  let closestDistance = Infinity;

  for (
    let i = 0;
    i < fingerTips.length;
    i++
  ) {

    let fingerTip = fingerTips[i];

    if (!fingerTip) {
      continue;
    }

    let distance =
      dist(
        fingerTip.x,
        fingerTip.y,
        thumb.x,
        thumb.y
      );

    if (
      distance <
      closestDistance
    ) {

      closestDistance = distance;

      closestFinger = i;

    }

  }


  if (
    !leftWasPinching &&
    closestDistance < 25
  ) {


    selectedColor = colors[closestFinger];

    selectedColorIndex = closestFinger;


    leftWasPinching = true;

  }


  if (
    leftWasPinching &&
    closestDistance > 35
  ) {

    leftWasPinching = false;

  }

}


// ==================================================
// RIGHT HAND
// ==================================================

function handleDrawingHand(
  hand
) {

  let index = hand.index_finger_tip;


  let thumb = hand.thumb_tip;

  let middle = hand.middle_finger_tip;


  let cameraX =
    (
      index.x +
      thumb.x
    ) * 0.5;


  let cameraY =
    (
      index.y +
      thumb.y
    ) * 0.5;
  cursorX =
    cameraX *
    width /
    640;


  cursorY =
    cameraY *
    height /
    480;


  smoothX =
    lerp(
      smoothX,
      cursorX,
      cursorSmoothing
    );


  smoothY =
    lerp(
      smoothY,
      cursorY,
      cursorSmoothing
    );


  let dx =
    index.x -
    thumb.x;


  let dy =
    index.y -
    thumb.y;


  let pinchDistance =
    sqrt(
      dx * dx +
      dy * dy
    );

  let middlePinchDistance =
    middle
      ? dist(
          middle.x,
          middle.y,
          thumb.x,
          thumb.y
        )
      : Infinity;

  let pinky = hand.pinky_finger_tip;

  let pinkyPinchDistance =
    pinky
      ? dist(
          pinky.x,
          pinky.y,
          thumb.x,
          thumb.y
        )
      : Infinity;


  if (
    pinkyPinchDistance < 23 &&
    pinchDistance > 32 &&
    middlePinchDistance > 35
  ) {

    if (!drawingWasClearPinching) {

      clearDrawing();

      drawingWasClearPinching = true;

    }

  } else if (
    pinkyPinchDistance > 35
  ) {

    drawingWasClearPinching = false;

  }


  if (
    middlePinchDistance < 23 &&
    pinchDistance > 32
  ) {

    if (!drawingWasUndoPinching) {

      undoLatestStroke();

      drawingWasUndoPinching = true;

    }

  } else if (
    middlePinchDistance > 35
  ) {

    drawingWasUndoPinching = false;

  }


  if (
    !isDrawing &&
    pinchDistance < 23
  ) {

    if (
      pinchStartTime === 0
    ) {

      pinchStartTime = millis();

    }


    if (
      millis() -
      pinchStartTime >
      pinchHoldTime
    ) {

      isDrawing = true;

      lastPinchTime = millis();

      pinchStartTime = 0;

    }

  }

  else if (
    !isDrawing
  ) {

    pinchStartTime = 0;

  }


  if (
    isDrawing &&
    pinchDistance < 32
  ) {

    lastPinchTime = millis();

  }


  if (
    isDrawing
  ) {

    let timeSincePinch =
      millis() -
      lastPinchTime;


    if (
      pinchDistance > 32 &&
      timeSincePinch >
      pinchGraceTime
    ) {

      isDrawing = false;

    }

  }


  if (
    isDrawing &&
    !wasDrawing
  ) {

    startStroke();

  }


  if (
    isDrawing
  ) {

    addPoint(
      smoothX,
      smoothY
    );


    updateTrail(
      smoothX,
      smoothY
    );

  }


  if (
    !isDrawing &&
    wasDrawing
  ) {

    finishStroke();

  }


  wasDrawing = isDrawing;

}


// ==================================================
// START STROKE
// ==================================================

function startStroke() {

  currentStroke = [];


  let stroke = {

    curve: [],

    color:
      selectedColor,

    noiseOffset:
      random(10000),

    time:
      0,

    completed:
      false

  };


  threadStrokes.push( stroke);


  activeThread = stroke;


  activeThread.curve.push({

    x:
      smoothX,

    y:
      smoothY,

    px:
      smoothX,

    py:
      smoothY,

    inputVx:
      0,

    inputVy:
      0,

    life:
      THREAD_START_LIFE

  });


  currentStroke.push({

    x:
      smoothX,

    y:
      smoothY

  });

}


// ==================================================
// ADD POINT
// ==================================================

function addPoint(
  x,
  y
) {

  if (
    !activeThread
  ) {

    return;

  }


  let curve = activeThread.curve;


  if (
    curve.length === 0
  ) {

    return;

  }


  let last =
    curve[
      curve.length - 1
    ];


  let distance =
    dist(
      x,
      y,
      last.x,
      last.y
    );


  if (
    distance <
    pointSpacing
  ) {

    return;

  }


  let steps =
    floor(
      distance /
      pointSpacing
    );


  if (
    steps < 1
  ) {

    steps = 1;

  }


  for (
    let i = 1;
    i <= steps;
    i++
  ) {

    let amount =
      i /
      steps;


    let newX =
      lerp(
        last.x,
        x,
        amount
      );


    let newY =
      lerp(
        last.y,
        y,
        amount
      );


    let vx =
      newX -
      last.x;


    let vy =
      newY -
      last.y;


    curve.push({

      x:
        newX,

      y:
        newY,

      px:
        newX,

      py:
        newY,

      inputVx:
        vx,

      inputVy:
        vy,

      life:
        THREAD_START_LIFE

    });


    currentStroke.push({

      x:
        newX,

      y:
        newY

    });


    saveCollisionSegment(

      last.x,
      last.y,

      newX,
      newY,

      vx,
      vy

    );


    last = {

      x:
        newX,

      y:
        newY

    };

  }

}


// ==================================================
// THREAD UPDATE
// ==================================================

function updateThreadStrokes() {

  for (
    let s = threadStrokes.length - 1;

    s >= 0;

    s--
  ) {

    let stroke = threadStrokes[s];


    if (
      stroke.completed
    ) {

      continue;

    }


    for (
      let step = 0;

      step <
      THREAD_DRAWS_PER_FRAME;

      step++
    ) {

      stepThread( stroke);


      drawThread( stroke);

    }


  }

}


// ==================================================
// THREAD PHYSICS
// ==================================================

function stepThread(
  stroke
) {

  let curve = stroke.curve;


  if (
    curve.length === 0
  ) {

    return;

  }


  while (
    curve.length > 0 &&
    stroke !== activeThread &&
    curve[0].life <= 0
  ) {

    curve.shift();

  }


  if (
    curve.length === 0
  ) {

    return;

  }


  stroke.time++;


  for (
    let i = 0;

    i < curve.length;

    i++
  ) {

    let p = curve[i];


    let accX = 0;

    let accY = 0;


    let symmetryAxisAngle =
      atan2(
        width / 2 -
        p.y,

        height / 2 -
        p.x
      );


    let noiseValue =
      noise(

        stroke.noiseOffset +
        p.x *
        THREAD_NOISE_SPACE +
        1000000,

        stroke.noiseOffset +
        p.y *
        THREAD_NOISE_SPACE +
        1000000,

        stroke.noiseOffset +
        stroke.time *
        THREAD_NOISE_TIME

      );


    let noiseAngle =
      THREAD_NOISE_ANGLE *
      noiseValue;


    noiseAngle += symmetryAxisAngle;


    accX +=
      THREAD_NOISE_FORCE *
      cos( noiseAngle);


    accY +=
      THREAD_NOISE_FORCE *
      sin( noiseAngle);


    accX +=
      THREAD_INITIAL_VELOCITY *
      p.inputVx;


    accY +=
      THREAD_INITIAL_VELOCITY *
      p.inputVy;


    p.inputVx *= THREAD_VELOCITY_DECAY;


    p.inputVy *= THREAD_VELOCITY_DECAY;


    let oldX = p.x;


    let oldY = p.y;


    p.x +=
      (
        p.x -
        p.px
      ) *
      THREAD_FRICTION +
      accX;


    p.y +=
      (
        p.y -
        p.py
      ) *
      THREAD_FRICTION +
      accY;


    p.px = oldX;


    p.py = oldY;


    if (
      stroke !== activeThread
    ) {

      p.life--;

    }

  }


  for (
    let i = 1;

    i < curve.length;

    i++
  ) {

    let p = curve[i];


    let p2 = curve[i - 1];


    let dx =
      p2.x -
      p.x;


    let dy =
      p2.y -
      p.y;


    let distance =
      sqrt(
        dx * dx +
        dy * dy
      );


    if (
      distance >
      THREAD_RESTING_DISTANCE +
      0.01
    ) {

      let difference =
        THREAD_RIGIDITY *
        (
          THREAD_RESTING_DISTANCE -
          distance
        ) /
        distance;


      let fx =
        difference *
        dx;


      let fy =
        difference *
        dy;


      p.x -= fx;


      p2.x += fx;


      p.y -= fy;


      p2.y += fy;

    }

  }

}


// ==================================================
// DRAW THREAD
// ==================================================

function drawThread(
  stroke
) {

  let curve = stroke.curve;


  if (
    curve.length < 2
  ) {

    return;

  }


  let newest =
    curve[
      curve.length - 1
    ];


  let lifeAmount =
    constrain(

      newest.life /
      THREAD_START_LIFE,

      0,
      1

    );


  let baseAlpha =
    THREAD_START_OPACITY *
    lifeAmount;


  if (
    baseAlpha <= 0
  ) {

    return;

  }


  /*
   * IMPORTANT:
   *
   * Audio is NOT used here.
   *
  * The actual thread is painted normally.
   * Audio brightness is applied later,
   * when the whole painting is displayed.
   *
   * This means old lines can react to
   * the current music too.
   */


  let drawColor =
    color(

      hue(
        stroke.color
      ),

      saturation(
        stroke.color
      ),

      brightness(
        stroke.color
      )

    );


  painting.push();


  painting.noFill();


  painting.stroke( drawColor);


  painting.strokeWeight( THREAD_LINE_WIDTH);


  painting.strokeCap( ROUND);


  painting.strokeJoin( ROUND);


  let ctx = painting.drawingContext;


  ctx.save();


  ctx.globalCompositeOperation = "lighter";


  ctx.globalAlpha = baseAlpha;


  let drawSymmetry = stroke.symmetry || symmetry;

  let drawMirror =
    stroke.symmetryMirror === undefined
      ? symmetryMirror
      : stroke.symmetryMirror;


  for (
    let i = 0;

    i < drawSymmetry;

    i++
  ) {

    let angle =
      i *
      TWO_PI /
      symmetry;


    drawThreadCurve(
      curve,
      angle,
      false,
      stroke.originX,
      stroke.originY
    );


    if (
      drawMirror
    ) {

      drawThreadCurve(
        curve,
        angle,
        true,
        stroke.originX,
        stroke.originY
      );

    }

  }


  ctx.restore();


  painting.pop();

}


// ==================================================
// DRAW TRANSFORMED CURVE
// ==================================================

function drawThreadCurve(
  curve,
  angle,
  mirror,
  originX = width / 2,
  originY = height / 2
) {

  if (
    curve.length < 2
  ) {

    return;

  }


  let first =
    transformThreadPoint(

      curve[0],

      angle,

      mirror,

      originX,

      originY

    );


  let second =
    transformThreadPoint(

      curve[1],

      angle,

      mirror,

      originX,

      originY

    );


  let ctx = painting.drawingContext;


  ctx.beginPath();


  ctx.moveTo(
    first.x,
    first.y
  );


  let previous = second;


  for (
    let i = 2;

    i < curve.length;

    i++
  ) {

    let current =
      transformThreadPoint(

        curve[i],

        angle,

        mirror,

        originX,

        originY

      );


    let midpointX =
      (
        previous.x +
        current.x
      ) *
      0.5;


    let midpointY =
      (
        previous.y +
        current.y
      ) *
      0.5;


    ctx.quadraticCurveTo(

      previous.x,
      previous.y,

      midpointX,
      midpointY

    );


    previous = current;

  }


  ctx.lineTo(
    previous.x,
    previous.y
  );


  ctx.stroke();

}


// ==================================================
// TRANSFORM
// ==================================================

function transformThreadPoint(
  p,
  angle,
  mirror,
  centerX,
  centerY
) {

  let x =
    p.x -
    centerX;


  let y =
    p.y -
    centerY;


  let rotatedX =
    x * cos(angle) -
    y * sin(angle);


  let rotatedY =
    x * sin(angle) +
    y * cos(angle);


  if (
    mirror
  ) {

    rotatedX = -rotatedX;

  }


  return {

    x:
      centerX +
      rotatedX,

    y:
      centerY +
      rotatedY

  };

}


// ==================================================
// FINISH
// ==================================================

function finishStroke() {

  let completedStroke = activeThread;

  if (
    activeThread
  ) {

    activeThread.completed = true;

  }


  activeThread = null;


  currentStroke = [];


  trail = [];


  if (
    completedStroke
  ) {

    paintingHistory.push( painting.get());

  }

}


function undoLatestStroke() {

  if (
    activeThread
  ) {

    return;

  }


  let strokeIndex = threadStrokes.length - 1;


  while (
    strokeIndex >= 0 &&
    !threadStrokes[strokeIndex].completed
  ) {

    strokeIndex--;

  }


  if (
    strokeIndex < 0
  ) {

    return;

  }


  let strokeToUndo = threadStrokes[strokeIndex];

  let currentPainting = painting.get();

  let previousPainting =
    paintingHistory[
      paintingHistory.length - 2
    ];


  threadStrokes.splice(
    strokeIndex,
    1
  );


  let segmentsToUndo =
    savedSegments.filter(
      function(segment) {
        return segment.stroke === strokeToUndo;
      }
    );


  for (
    let segment of segmentsToUndo
  ) {

    removeFromGrid( segment);

  }


  savedSegments =
    savedSegments.filter(
      function(segment) {
        return segment.stroke !== strokeToUndo;
      }
    );


  pulledSegments =
    pulledSegments.filter(
      function(pull) {
        return pull.segment.stroke !== strokeToUndo;
      }
    );


  if (
    paintingHistory.length > 1
  ) {

    paintingHistory.pop();

    painting.clear();

    painting.image(
      previousPainting,
      0,
      0
    );

    beginUndoStrokeFade(
      currentPainting,
      previousPainting
    );

  }

}


// ==================================================
// COLLISION SEGMENT
// ==================================================

function saveCollisionSegment(

  x1,
  y1,

  x2,
  y2,

  directionX,
  directionY

) {

  for (
    let i = 0;

    i < symmetry;

    i++
  ) {

    let angle =
      i *
      TWO_PI /
      symmetry;


    let a =
      rotatePoint(

        x1,
        y1,
        angle

      );


    let b =
      rotatePoint(

        x2,
        y2,
        angle

      );


    checkCollision(

      a.x,
      a.y,

      b.x,
      b.y,

      directionX,
      directionY

    );


    let segment = {

      x1:
        a.x,

      y1:
        a.y,

      x2:
        b.x,

      y2:
        b.y,

      weight:
        1,

      color:
        selectedColor,

      stroke:
        activeThread

    };


    savedSegments.push( segment);


    addToGrid( segment);

  }

}


// ==================================================
// GRID
// ==================================================

function getGridCell(
  x,
  y
) {

  let gx =
    floor(
      x /
      gridSize
    );


  let gy =
    floor(
      y /
      gridSize
    );


  return (

    gx +
    "," +
    gy

  );

}


function addToGrid(
  segment
) {

  let minX =
    min(
      segment.x1,
      segment.x2
    );


  let maxX =
    max(
      segment.x1,
      segment.x2
    );


  let minY =
    min(
      segment.y1,
      segment.y2
    );


  let maxY =
    max(
      segment.y1,
      segment.y2
    );


  let startX =
    floor(

      (
        minX -
        collisionDistance
      ) /
      gridSize

    );


  let endX =
    floor(

      (
        maxX +
        collisionDistance
      ) /
      gridSize

    );


  let startY =
    floor(

      (
        minY -
        collisionDistance
      ) /
      gridSize

    );


  let endY =
    floor(

      (
        maxY +
        collisionDistance
      ) /
      gridSize

    );


  for (
    let x = startX;

    x <= endX;

    x++
  ) {

    for (
      let y = startY;

      y <= endY;

      y++
    ) {

      let key =
        x +
        "," +
        y;


      if (
        !grid.has(key)
      ) {

        grid.set(
          key,
          []
        );

      }


      grid.get(
        key
      ).push( segment);

    }

  }

}


// ==================================================
// COLLISION
// ==================================================

function checkCollision(

  x1,
  y1,

  x2,
  y2,

  directionX,
  directionY

) {

  let minX =
    min(
      x1,
      x2
    ) -
    collisionDistance;


  let maxX =
    max(
      x1,
      x2
    ) +
    collisionDistance;


  let minY =
    min(
      y1,
      y2
    ) -
    collisionDistance;


  let maxY =
    max(
      y1,
      y2
    ) +
    collisionDistance;


  let startX =
    floor(
      minX /
      gridSize
    );


  let endX =
    floor(
      maxX /
      gridSize
    );


  let startY =
    floor(
      minY /
      gridSize
    );


  let endY =
    floor(
      maxY /
      gridSize
    );


  let checked = new Set();


  for (
    let gx = startX;

    gx <= endX;

    gx++
  ) {

    for (
      let gy = startY;

      gy <= endY;

      gy++
    ) {

      let key =
        gx +
        "," +
        gy;


      let cell =
        grid.get( key);


      if (
        !cell
      ) {

        continue;

      }


      for (
        let segment of cell
      ) {

        if (
          checked.has(
            segment
          )
        ) {

          continue;

        }


        checked.add( segment);


        let distance =
          segmentDistance(

            x1,
            y1,

            x2,
            y2,

            segment.x1,
            segment.y1,

            segment.x2,
            segment.y2

          );


        if (
          distance <=
          collisionDistance
        ) {

          createPull(

            segment,

            directionX,
            directionY

          );


          return;

        }

      }

    }

  }

}


// ==================================================
// SEGMENT DISTANCE
// ==================================================

function segmentDistance(

  ax,
  ay,

  bx,
  by,

  cx,
  cy,

  dx,
  dy

) {

  if (
    segmentsIntersect(

      ax,
      ay,

      bx,
      by,

      cx,
      cy,

      dx,
      dy

    )
  ) {

    return 0;

  }


  let p1 =
    closestPointOnSegment(

      ax,
      ay,

      cx,
      cy,

      dx,
      dy

    );


  let p2 =
    closestPointOnSegment(

      bx,
      by,

      cx,
      cy,

      dx,
      dy

    );


  let p3 =
    closestPointOnSegment(

      cx,
      cy,

      ax,
      ay,

      bx,
      by

    );


  let p4 =
    closestPointOnSegment(

      dx,
      dy,

      ax,
      ay,

      bx,
      by

    );


  return min(

    dist(
      ax,
      ay,
      p1.x,
      p1.y
    ),

    dist(
      bx,
      by,
      p2.x,
      p2.y
    ),

    dist(
      cx,
      cy,
      p3.x,
      p3.y
    ),

    dist(
      dx,
      dy,
      p4.x,
      p4.y
    )

  );

}


// ==================================================
// INTERSECTION
// ==================================================

function segmentsIntersect(

  x1,
  y1,

  x2,
  y2,

  x3,
  y3,

  x4,
  y4

) {

  let denominator =

    (
      x1 -
      x2
    ) *

    (
      y3 -
      y4
    )

    -

    (
      y1 -
      y2
    ) *

    (
      x3 -
      x4
    );


  if (
    abs(
      denominator
    ) <
    0.0001
  ) {

    return false;

  }


  let t =

    (

      (
        x1 -
        x3
      ) *

      (
        y3 -
        y4
      )

      -

      (
        y1 -
        y3
      ) *

      (
        x3 -
        x4
      )

    ) /
    denominator;


  let u =

    (

      (
        x1 -
        x3
      ) *

      (
        y1 -
        y2
      )

      -

      (
        y1 -
        y3
      ) *

      (
        x1 -
        x2
      )

    ) /
    denominator;


  return (

    t >= 0 &&
    t <= 1 &&

    u >= 0 &&
    u <= 1

  );

}


// ==================================================
// CLOSEST POINT
// ==================================================

function closestPointOnSegment(

  px,
  py,

  x1,
  y1,

  x2,
  y2

) {

  let dx =
    x2 -
    x1;


  let dy =
    y2 -
    y1;


  let lengthSquared =
    dx * dx +
    dy * dy;


  if (
    lengthSquared === 0
  ) {

    return {

      x:
        x1,

      y:
        y1

    };

  }


  let t =

    (

      (
        px -
        x1
      ) *
      dx

      +

      (
        py -
        y1
      ) *
      dy

    ) /
    lengthSquared;


  t =
    constrain(
      t,
      0,
      1
    );


  return {

    x:
      x1 +
      t * dx,

    y:
      y1 +
      t * dy

  };

}


// ==================================================
// CREATE PULL
// ==================================================

function createPull(

  segment,

  directionX,

  directionY

) {

  for (
    let pull of pulledSegments
  ) {

    if (
      pull.segment ===
      segment
    ) {

      return;

    }

  }


  pulledSegments.push({

    segment:
      segment,

    directionX:
      directionX,

    directionY:
      directionY,

    startTime:
      millis()

  });


  if (
    pulledSegments.length >
    40
  ) {

    pulledSegments.shift();

  }

}


// ==================================================
// DRAW PULLED SEGMENTS
// ==================================================

function drawPulledSegments() {

  if (
    pulledSegments.length ===
    0
  ) {

    return;

  }


  let now = millis();


  push();


  noFill();


  strokeCap( ROUND);


  for (
    let i = pulledSegments.length - 1;

    i >= 0;

    i--
  ) {

    let pull = pulledSegments[i];


    let age =
      now -
      pull.startTime;


    let life =
      1 -
      age /
      250;


    if (
      life <= 0
    ) {

      pulledSegments.splice(
        i,
        1
      );

      continue;

    }


    let strength =
      pullStrength *
      life *
      life;


    let segment = pull.segment;


    stroke( segment.color);


    strokeWeight( segment.weight);


    let moveX =
      pull.directionX *
      strength;


    let moveY =
      pull.directionY *
      strength;


    line(

      segment.x1 +
      moveX,

      segment.y1 +
      moveY,

      segment.x2 +
      moveX,

      segment.y2 +
      moveY

    );

  }


  pop();

}


// ==================================================
// ROTATE POINT
// ==================================================

function rotatePoint(
  x,
  y,
  angle
) {

  let centerX = width / 2;


  let centerY = height / 2;


  let dx =
    x -
    centerX;


  let dy =
    y -
    centerY;


  return {

    x:
      centerX +
      dx * cos(angle) -
      dy * sin(angle),

    y:
      centerY +
      dx * sin(angle) +
      dy * cos(angle)

  };

}


// ==================================================
// CURSOR
// ==================================================

function drawCursor(
  hand
) {

  let x = smoothX;


  let y = smoothY;


  let index = hand.index_finger_tip;


  let thumb = hand.thumb_tip;


  let dx =
    index.x -
    thumb.x;


  let dy =
    index.y -
    thumb.y;


  let pinchDistance =
    sqrt(
      dx * dx +
      dy * dy
    );


  if (
    pinchDistance < 23
  ) {

    smoothCursorSize = 0;

    return;

  }


  let targetSize =
    map(

      pinchDistance,

      23,
      80,

      8,
      30,

      true

    );


  smoothCursorSize =
    lerp(

      smoothCursorSize,

      targetSize,

      0.15

    );


  push();


  noFill();

  drawingContext.shadowBlur = 20;

  drawingContext.shadowColor =
    color(
      hue(selectedColor),
      saturation(selectedColor),
      brightness(selectedColor),
      190
    );


  stroke( selectedColor);


  strokeWeight( 1.5);


  circle(

    x,
    y,

    smoothCursorSize

  );

  drawingContext.shadowBlur = 0;


  pop();

}


// ==================================================
// CLEAR
// ==================================================

function keyPressed() {

  if (
    key === "c" ||
    key === "C"
  ) {

    clearDrawing();

  }

}


function clearDrawing() {

  beginPaintingFade();

    paintingHistory = [
      createImage(
        width,
        height
      )
    ];

    threadStrokes = [];

    activeThread = null;

    drawingWasUndoPinching = false;

    currentStroke = [];

    savedSegments = [];

    pulledSegments = [];

    grid.clear();

    trail = [];

    audioBass = 0;
    audioMid = 0;
    audioHigh = 0;
    audioBeat = 0;
    audioPulse = 0;
    previousAudioPulse = 0;
    audioWaveRadii = new Array(8).fill(2.0);
    audioWaveStrengths = new Array(8).fill(0);
    audioEnergyAverage = 0;

}


function beginPaintingFade(
  target = null
) {

  if (
    paintingFadeStartTime > 0
  ) {

    return;

  }

  paintingFadeTarget = target;

  paintingFadeStartTime = millis();

}


function beginUndoStrokeFade(
  currentPainting,
  previousPainting
) {

  undoFadeLayer =
    createGraphics(
      width,
      height
    );

  undoFadeLayer.pixelDensity(1);
  undoFadeLayer.clear();

  currentPainting.loadPixels();
  previousPainting.loadPixels();
  undoFadeLayer.loadPixels();

  for (
    let pixelIndex = 0;
    pixelIndex < undoFadeLayer.pixels.length;
    pixelIndex += 4
  ) {

    let changed =
      abs(
        currentPainting.pixels[pixelIndex] -
        previousPainting.pixels[pixelIndex]
      ) > 2 ||
      abs(
        currentPainting.pixels[pixelIndex + 1] -
        previousPainting.pixels[pixelIndex + 1]
      ) > 2 ||
      abs(
        currentPainting.pixels[pixelIndex + 2] -
        previousPainting.pixels[pixelIndex + 2]
      ) > 2 ||
      abs(
        currentPainting.pixels[pixelIndex + 3] -
        previousPainting.pixels[pixelIndex + 3]
      ) > 2;


    if (
      changed
    ) {

      undoFadeLayer.pixels[pixelIndex] = currentPainting.pixels[pixelIndex];
      undoFadeLayer.pixels[pixelIndex + 1] = currentPainting.pixels[pixelIndex + 1];
      undoFadeLayer.pixels[pixelIndex + 2] = currentPainting.pixels[pixelIndex + 2];
      undoFadeLayer.pixels[pixelIndex + 3] = currentPainting.pixels[pixelIndex + 3];

    }

  }

  undoFadeLayer.updatePixels();
  undoFadeStartTime = millis();

}


function drawUndoStrokeFade() {

  if (
    !undoFadeLayer ||
    undoFadeStartTime === 0
  ) {

    return;

  }

  let elapsedTime = millis() - undoFadeStartTime;

  let opacity =
    1 -
    constrain(
      elapsedTime /
      paintingFadeDuration,
      0,
      1
    );

  push();
  tint(255, opacity * 255);
  image(
    undoFadeLayer,
    0,
    0
  );
  pop();


  if (
    opacity <= 0
  ) {

    undoFadeLayer = null;
    undoFadeStartTime = 0;

  }

}


function updatePaintingFade() {

  if (
    paintingFadeStartTime === 0
  ) {

    return;

  }

  let elapsedTime = millis() - paintingFadeStartTime;

  let fadeAmount =
    constrain(
      elapsedTime /
      paintingFadeDuration,
      0,
      1
    );

  let paintingContext = painting.drawingContext;

  paintingContext.save();
  paintingContext.globalCompositeOperation = "destination-out";
  paintingContext.fillStyle =
    "rgba(0, 0, 0, " +
    min(0.16, 0.16 * (1 + fadeAmount)) +
    ")";
  paintingContext.fillRect(
    0,
    0,
    painting.width,
    painting.height
  );
  paintingContext.restore();


  if (
    fadeAmount >= 1
  ) {

    painting.clear();

    if (
      paintingFadeTarget
    ) {

      painting.image(
        paintingFadeTarget,
        0,
        0
      );

    }

    paintingFadeTarget = null;

    paintingFadeStartTime = 0;

  }

}


// ==================================================
// RESIZE
// ==================================================

function windowResized() {

  let oldPainting = painting;


  resizeCanvas(

    windowWidth,
    windowHeight

  );


  painting =
    createGraphics(

      windowWidth,
      windowHeight

    );


  painting.pixelDensity( 1);


  painting.colorMode(

    HSB,

    360,
    100,
    100,
    255

  );


  if (
    displacementLayer
  ) {

    displacementLayer.resizeCanvas(
      windowWidth,
      windowHeight
    );

  }


  painting.image(

    oldPainting,

    0,
    0,

    windowWidth,
    windowHeight

  );

}


function removeFromGrid(
  segment
) {

  let minX =
    min(
      segment.x1,
      segment.x2
    );

  let maxX =
    max(
      segment.x1,
      segment.x2
    );

  let minY =
    min(
      segment.y1,
      segment.y2
    );

  let maxY =
    max(
      segment.y1,
      segment.y2
    );

  let startX =
    floor(
      (
        minX -
        collisionDistance
      ) /
      gridSize
    );

  let endX =
    floor(
      (
        maxX +
        collisionDistance
      ) /
      gridSize
    );

  let startY =
    floor(
      (
        minY -
        collisionDistance
      ) /
      gridSize
    );

  let endY =
    floor(
      (
        maxY +
        collisionDistance
      ) /
      gridSize
    );

  for (
    let x = startX;
    x <= endX;
    x++
  ) {

    for (
      let y = startY;
      y <= endY;
      y++
    ) {

      let key =
        x +
        "," +
        y;

      let cell =
        grid.get( key);

      if (!cell) {
        continue;
      }

      let remaining =
        cell.filter(
          function(item) {
            return item !== segment;
          }
        );

      if (remaining.length === 0) {
        grid.delete(key);
      } else {
        grid.set(
          key,
          remaining
        );
      }

    }

  }

}
