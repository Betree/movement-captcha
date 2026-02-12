/**
 * Movement-based captcha prototype.
 * Pure functions for generation, layout, movement; orchestration for DOM and events.
 */

// --- Alphabet & generation (pure) ---

const CLEAN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function getCleanAlphabet() {
  return CLEAN_ALPHABET;
}

function pickRandom(arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function generateSolution(length, alphabet) {
  return pickRandom([...alphabet], length).join("");
}

function generateNoise(count, alphabet, excludeChars) {
  const excludeSet = new Set([...excludeChars]);
  const available = [...alphabet].filter((c) => !excludeSet.has(c));
  return pickRandom(available, count);
}

// --- Layout (pure) ---

const CHAR_SIZE = 20;
const PADDING = 12;

function getContentBox(containerEl) {
  const rect = containerEl.getBoundingClientRect();
  const style = getComputedStyle(containerEl);
  const padding = parseFloat(style.padding) || PADDING;
  return {
    width: rect.width - 2 * padding,
    height: rect.height - 2 * padding,
    padding,
  };
}

function randomPositionInBox(box, charSize) {
  const margin = charSize / 2;
  const maxX = Math.max(0, box.width - charSize - margin);
  const maxY = Math.max(0, box.height - charSize - margin);
  return {
    x: box.padding + margin + Math.random() * maxX,
    y: box.padding + margin + Math.random() * maxY,
  };
}

function computePlacements(solution, noise, box) {
  const placements = [];
  let solutionIndex = 0;
  let noiseIndex = 0;

  const all = [
    ...[...solution].map((c) => ({ char: c, isSolution: true })),
    ...noise.map((c) => ({ char: c, isSolution: false })),
  ];

  // Shuffle so solution and noise are interleaved
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  for (const { char, isSolution } of all) {
    const pos = randomPositionInBox(box, CHAR_SIZE);
    placements.push({
      char,
      x: pos.x,
      y: pos.y,
      isSolution,
      index: isSolution ? solutionIndex++ : noiseIndex++,
    });
  }

  return placements;
}

// --- Movement paths (pure) ---

function getCirclePath(radius, centerX, centerY) {
  return (t) => {
    const angle = t * 2 * Math.PI;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  };
}

function getSquarePath(size, centerX, centerY) {
  const half = size / 2;
  const perimeter = 4 * half * 2;
  return (t) => {
    let d = (t * perimeter) % perimeter;
    if (d < half * 2) return { x: centerX - half + d, y: centerY - half };
    d -= half * 2;
    if (d < half * 2) return { x: centerX + half, y: centerY - half + d };
    d -= half * 2;
    if (d < half * 2) return { x: centerX + half - d, y: centerY + half };
    d -= half * 2;
    return { x: centerX - half, y: centerY + half - d };
  };
}

function getTrianglePath(size, centerX, centerY) {
  const h = (size * Math.sqrt(3)) / 2;
  const top = { x: centerX, y: centerY - (h * 2) / 3 };
  const left = { x: centerX - size / 2, y: centerY + h / 3 };
  const right = { x: centerX + size / 2, y: centerY + h / 3 };
  const seg1 = dist(top, left);
  const seg2 = dist(left, right);
  const seg3 = dist(right, top);
  const total = seg1 + seg2 + seg3;

  return (t) => {
    let d = (t * total) % total;
    if (d < seg1) return lerp(top, left, d / seg1);
    d -= seg1;
    if (d < seg2) return lerp(left, right, d / seg2);
    d -= seg2;
    return lerp(right, top, d / seg3);
  };
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function getZPath(size, centerX, centerY) {
  const half = size / 2;
  return (t) => {
    const s = (t * 3) % 3;
    if (s < 1)
      return lerp(
        { x: centerX - half, y: centerY - half },
        { x: centerX + half, y: centerY - half },
        s,
      );
    if (s < 2)
      return lerp(
        { x: centerX + half, y: centerY - half },
        { x: centerX - half, y: centerY + half },
        s - 1,
      );
    return lerp(
      { x: centerX - half, y: centerY + half },
      { x: centerX + half, y: centerY + half },
      s - 2,
    );
  };
}

function getFigure8Path(size, centerX, centerY) {
  const half = size / 2;
  return (t) => {
    const angle = t * 2 * Math.PI;
    return {
      x: centerX + half * Math.sin(angle),
      y: centerY + half * Math.sin(2 * angle),
    };
  };
}

function getInfinityPath(size, centerX, centerY) {
  const half = size / 2;
  return (t) => {
    const angle = t * 2 * Math.PI;
    const denom = 1 + Math.sin(angle) ** 2;
    return {
      x: centerX + half * (Math.cos(angle) / denom),
      y: centerY + half * ((Math.sin(angle) * Math.cos(angle)) / denom),
    };
  };
}

function getVibratePath(size, centerX, centerY) {
  const half = size / 2;
  return (t) => ({
    x: centerX + half * Math.sin(t * 2 * Math.PI * 3),
    y: centerY + half * Math.sin(t * 2 * Math.PI * 4),
  });
}

function applyDirection(t, phase, direction) {
  const normalized = (t + phase) % 1;
  return direction === "counter" ? 1 - normalized : normalized;
}

function getPathByType(
  type,
  centerX,
  centerY,
  size,
  box,
  phase,
  index,
  direction,
) {
  if (type === "random") {
    const seed = index * 1234.5678;
    const amp = size;
    const dir = direction === "counter" ? -1 : 1;
    const nX = 3;
    const nY = 2;
    return (t) => {
      const effectiveT = applyDirection(t, phase, direction);
      const angleX = seed + dir * effectiveT * 2 * Math.PI * nX;
      const angleY = seed * 1.3 + dir * effectiveT * 2 * Math.PI * nY;
      return {
        x: centerX + (Math.sin(angleX) * 0.5 + 0.5) * amp * 2 - amp,
        y: centerY + (Math.cos(angleY) * 0.5 + 0.5) * amp * 2 - amp,
      };
    };
  }

  if (type === "matrix") {
    const speed = 0.3 + (index % 7) * 0.1;
    const innerHeight = box.height;
    const dir = direction === "counter" ? -1 : 1;
    return (t) => {
      const effectiveT = applyDirection(t, phase, direction);
      const offset = dir * effectiveT * speed * innerHeight;
      const y =
        box.padding +
        ((((centerY - box.padding + offset) % innerHeight) + innerHeight) %
          innerHeight);
      return { x: centerX, y };
    };
  }

  if (type === "teleportation") {
    const margin = CHAR_SIZE / 2;
    const minX = box.padding + margin;
    const maxX = box.padding + box.width - margin;
    const minY = box.padding + margin;
    const maxY = box.padding + box.height - margin;
    const numJumps = 8;

    function seededRandom(seed) {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    }

    return (t) => {
      const effectiveT = applyDirection(t, phase, direction);
      const step = Math.floor(effectiveT * numJumps) % numJumps;
      const seed1 = index * 7.3 + step * 11.7 + phase * 100;
      const seed2 = index * 13.1 + step * 17.9 + phase * 100 + 1;
      return {
        x: minX + seededRandom(seed1) * (maxX - minX),
        y: minY + seededRandom(seed2) * (maxY - minY),
      };
    };
  }

  let pathFn;
  if (type === "circle") pathFn = getCirclePath(size / 2, centerX, centerY);
  else if (type === "square") pathFn = getSquarePath(size, centerX, centerY);
  else if (type === "triangle")
    pathFn = getTrianglePath(size, centerX, centerY);
  else if (type === "z") pathFn = getZPath(size, centerX, centerY);
  else if (type === "8") pathFn = getFigure8Path(size, centerX, centerY);
  else if (type === "infinity")
    pathFn = getInfinityPath(size, centerX, centerY);
  else if (type === "vibrate") pathFn = getVibratePath(size, centerX, centerY);
  else pathFn = getCirclePath(size / 2, centerX, centerY);

  // Triangle path (top→left→right) is inherently CCW on screen; invert direction to match labels
  const effectiveDirection =
    type === "triangle"
      ? direction === "clockwise"
        ? "counter"
        : "clockwise"
      : direction;
  return (t) => pathFn(applyDirection(t, phase, effectiveDirection));
}

function getRandomGlobalCenter(box, shapeRadius) {
  const baseSize = Math.min(box.width, box.height) * 0.35;
  const size = baseSize * shapeRadiusToFactor(shapeRadius);
  const half = size / 2;
  const minX = box.padding + half;
  const maxX = box.padding + box.width - half;
  const minY = box.padding + half;
  const maxY = box.padding + box.height - half;
  return {
    x: minX + Math.random() * (maxX - minX),
    y: minY + Math.random() * (maxY - minY),
  };
}

function shapeRadiusToFactor(radius) {
  return radius / 5;
}

function getGlobalMovementPath(
  shape,
  box,
  charIndex,
  totalChars,
  center,
  shapeRadius,
  direction,
) {
  const baseSize = Math.min(box.width, box.height) * 0.35;
  const size = baseSize * shapeRadiusToFactor(shapeRadius);
  const phase = totalChars > 1 ? (charIndex / totalChars) % 1 : 0;
  return getPathByType(
    shape,
    center.x,
    center.y,
    size,
    box,
    phase,
    charIndex,
    direction,
  );
}

function getSeparateMovementPath(
  shape,
  box,
  baseX,
  baseY,
  index,
  shapeRadius,
  direction,
) {
  const baseSize = Math.min(box.width, box.height) * 0.15;
  const size = baseSize * shapeRadiusToFactor(shapeRadius);
  const phase = (index * 0.17) % 1;
  return getPathByType(shape, baseX, baseY, size, box, phase, index, direction);
}

function getNoiseMovementPath(
  type,
  box,
  index,
  baseX,
  baseY,
  shapeRadius,
  direction,
) {
  const baseSize = Math.min(box.width, box.height) * 0.15;
  const size = baseSize * shapeRadiusToFactor(shapeRadius);
  const phase = (index * 0.17) % 1;
  return getPathByType(type, baseX, baseY, size, box, phase, index, direction);
}

// --- DOM & animation ---

let animationId = null;

function vividnessToSaturate(value) {
  return 0.2 + ((value - 1) / 9) * 1.8;
}

function createCharElement(char, isSolution, colorVariationSpeed) {
  const el = document.createElement("span");
  el.className = `captcha-char ${isSolution ? "solution" : "noise"}`;
  el.textContent = char;
  el.style.left = "0";
  el.style.top = "0";

  if (colorVariationSpeed > 0) {
    el.dataset.colorPhase = String(Math.random() * 360);
  }

  return el;
}

function speedToDuration(speed) {
  return 10_000 / speed;
}

function colorVariationCycleDuration(speed) {
  return 3000 / speed;
}

function runAnimation(container, chars, paths, placements, options) {
  const solutionDuration = speedToDuration(options.speed);
  const noiseDuration = speedToDuration(options.noiseSpeed);
  const colorVariation = (options.colorVariationSpeed ?? 0) > 0;
  const colorDuration = colorVariation
    ? colorVariationCycleDuration(options.colorVariationSpeed)
    : 0;
  const startTime = performance.now();

  function frame(now) {
    const elapsed = (now - startTime) / 1000;
    const tSolution = (elapsed / (solutionDuration / 1000)) % 1;
    const tNoise = (elapsed / (noiseDuration / 1000)) % 1;

    for (let i = 0; i < chars.length; i++) {
      const el = chars[i];
      const t = placements[i].isSolution ? tSolution : tNoise;
      const pos = paths[i](t);
      el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;

      const saturateVal = vividnessToSaturate(options.colorVividness ?? 5);
      const saturateFilter = `saturate(${saturateVal})`;
      if (colorVariation && el.dataset.colorPhase !== undefined) {
        const phase = Number(el.dataset.colorPhase);
        const hue = ((elapsed / (colorDuration / 1000)) * 360 + phase) % 360;
        el.style.filter = `hue-rotate(${hue}deg) ${saturateFilter}`;
      } else {
        el.style.filter = saturateFilter;
      }
    }
    animationId = requestAnimationFrame(frame);
  }

  animationId = requestAnimationFrame(frame);
}

function renderCaptcha(container, placements, paths, options) {
  const chars = [];

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    const el = createCharElement(
      p.char,
      p.isSolution,
      options.colorVariationSpeed ?? 0,
    );
    const initialPos = paths[i](0);
    el.style.transform = `translate(${initialPos.x}px, ${initialPos.y}px)`;
    container.appendChild(el);
    chars.push(el);
  }
  runAnimation(container, chars, paths, placements, options);
  return chars;
}

function clearCaptcha(container) {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  container.innerHTML = "";
}

// --- Validation ---

function normalizeInput(str) {
  return String(str).trim().toUpperCase().replace(/\s+/g, "");
}

function validateSolution(userInput, expectedSolution) {
  const a = [...normalizeInput(userInput)].sort().join("");
  const b = [...expectedSolution].sort().join("");
  return a === b;
}

// --- OTP-style inputs ---

function clearValidationState(inputs, statusEl) {
  inputs.forEach((inp) => inp.classList.remove("invalid"));
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "validation-status";
  }
}

function getInvalidIndices(userInput, expectedSolution) {
  const counts = {};
  for (const c of expectedSolution) {
    counts[c] = (counts[c] || 0) + 1;
  }
  const invalid = [];
  for (const c of userInput) {
    if (counts[c] && counts[c] > 0) {
      counts[c]--;
      invalid.push(false);
    } else {
      invalid.push(true);
    }
  }
  return invalid;
}

function showValidationResult(valid, inputs, statusEl, userValue, solution) {
  if (!statusEl) return;
  statusEl.textContent = valid ? "✓" : "✗";
  statusEl.className = `validation-status ${valid ? "valid" : "invalid"}`;
  const invalidIndices = valid ? [] : getInvalidIndices(userValue, solution);
  inputs.forEach((inp, i) => {
    inp.classList.toggle("invalid", invalidIndices[i] === true);
  });
}

function buildOtpInputs(container, length, solution, onValidate) {
  container.innerHTML = "";
  const inputs = [];
  const statusEl = document.getElementById("validation-status");
  for (let i = 0; i < length; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "text";
    input.autocomplete = "off";
    input.maxLength = 1;
    input.setAttribute("aria-label", `Character ${i + 1} of ${length}`);
    input.dataset.index = String(i);
    inputs.push(input);
    container.appendChild(input);
  }

  const validChars = new Set([...getCleanAlphabet()]);

  function checkAndValidate() {
    const value = getOtpValue(inputs);
    if (value.length === length) {
      const valid = validateSolution(value, solution);
      showValidationResult(valid, inputs, statusEl, value, solution);
      onValidate?.(valid, value);
    } else {
      clearValidationState(inputs, statusEl);
    }
  }

  // Auto-advance on input
  inputs.forEach((input, i) => {
    input.addEventListener("input", (e) => {
      clearValidationState(inputs, statusEl);
      let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      val = [...val].filter((c) => validChars.has(c)).join("");
      if (val.length >= 1) {
        e.target.value = val.slice(-1);
        if (i < inputs.length - 1) inputs[i + 1].focus();
      } else {
        e.target.value = "";
      }
      checkAndValidate();
    });
  });

  // Keydown: backspace to prev, arrows
  inputs.forEach((input, i) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        clearValidationState(inputs, statusEl);
      }
      if (e.key === "Backspace" && !input.value && i > 0) {
        inputs[i - 1].focus();
        inputs[i - 1].value = "";
        setTimeout(checkAndValidate, 0);
      } else if (e.key === "ArrowLeft" && i > 0) {
        inputs[i - 1].focus();
      } else if (e.key === "ArrowRight" && i < inputs.length - 1) {
        inputs[i + 1].focus();
      }
    });
  });

  // Paste: distribute across boxes (use onpaste to avoid accumulating handlers)
  const pastedFiltered = (s) =>
    [...s.toUpperCase().replace(/[^A-Z0-9]/g, "")]
      .filter((c) => validChars.has(c))
      .join("");
  container.onpaste = (e) => {
    e.preventDefault();
    const pasted = pastedFiltered(e.clipboardData?.getData("text") || "");
    if (!pasted) return;
    clearValidationState(inputs, statusEl);
    const active = document.activeElement;
    const startIdx = inputs.indexOf(active);
    const idx = startIdx >= 0 ? startIdx : 0;
    for (let i = 0; i < pasted.length && idx + i < inputs.length; i++) {
      inputs[idx + i].value = pasted[i];
    }
    const nextIdx = Math.min(idx + pasted.length, inputs.length - 1);
    inputs[nextIdx].focus();
    checkAndValidate();
  };

  return inputs;
}

function getOtpValue(inputs) {
  return inputs.map((inp) => inp.value).join("");
}

function clearOtpInputs(inputs) {
  inputs.forEach((inp) => {
    inp.value = "";
  });
  if (inputs.length) inputs[0].focus();
}

// --- Orchestration ---

let currentSolution = "";
let otpInputs = [];
let initInProgress = false;

function getPathForPlacement(placement, placements, box, options) {
  if (placement.isSolution) {
    const solutionCount = placements.filter((p) => p.isSolution).length;
    if (options.solutionStyle === "global") {
      return getGlobalMovementPath(
        options.solutionShape,
        box,
        placement.index,
        solutionCount,
        options.globalCenter,
        options.shapeRadius,
        options.solutionDirection,
      );
    }
    return getSeparateMovementPath(
      options.solutionShape,
      box,
      placement.x,
      placement.y,
      placement.index,
      options.shapeRadius,
      options.solutionDirection,
    );
  }
  return getNoiseMovementPath(
    options.noiseMovement,
    box,
    placement.index,
    placement.x,
    placement.y,
    options.shapeRadius,
    options.noiseDirection,
  );
}

function initCaptcha(container, params, opts = {}) {
  if (initInProgress) return;
  initInProgress = true;
  try {
    return initCaptchaImpl(container, params, opts);
  } finally {
    initInProgress = false;
  }
}

function initCaptchaImpl(container, params, opts = {}) {
  const preserveSolution = opts.preserveSolution === true;
  const savedUserValue = preserveSolution ? getOtpValue(otpInputs) : "";

  clearCaptcha(container);
  const statusEl = document.getElementById("validation-status");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "validation-status";
  }
  const inputsContainer = document.getElementById("captcha-inputs");
  const box = getContentBox(container);
  if (params.solutionStyle === "global") {
    params.globalCenter = getRandomGlobalCenter(box, params.shapeRadius);
  }

  const alphabet = getCleanAlphabet();
  const solution =
    preserveSolution &&
    currentSolution &&
    currentSolution.length === params.length
      ? currentSolution
      : generateSolution(params.length, alphabet);
  const noise = generateNoise(params.noiseCount, alphabet, solution);

  currentSolution = solution;

  otpInputs = buildOtpInputs(inputsContainer, params.length, solution);
  if (preserveSolution && savedUserValue) {
    for (let i = 0; i < savedUserValue.length && i < otpInputs.length; i++) {
      otpInputs[i].value = savedUserValue[i];
    }
    if (savedUserValue.length === params.length) {
      const valid = validateSolution(savedUserValue, solution);
      showValidationResult(
        valid,
        otpInputs,
        statusEl,
        savedUserValue,
        solution,
      );
    }
  } else {
    clearOtpInputs(otpInputs);
  }

  const placements = computePlacements(solution, noise, box);

  const pathFns = placements.map((p) =>
    getPathForPlacement(p, placements, box, params),
  );

  renderCaptcha(container, placements, pathFns, params);
}

// Presets: name -> params (partial, merged over defaults)
const PRESETS = [
  {
    name: "It's all about speed",
    params: {
      speed: 2,
      noiseSpeed: 10,
      shapeRadius: 6,
      length: 5,
      noiseCount: 8,
      noiseMovement: "random",
      solutionShape: "vibrate",
      solutionDirection: "clockwise",
      noiseDirection: "clockwise",
      solutionStyle: "separate",
      colorVariationSpeed: 5,
      colorVividness: 5,
    },
  },
  {
    name: "Matrix",
    params: {
      speed: 2,
      noiseSpeed: 10,
      shapeRadius: 6,
      length: 5,
      noiseCount: 8,
      noiseMovement: "matrix",
      solutionShape: "matrix",
      solutionDirection: "clockwise",
      noiseDirection: "clockwise",
      solutionStyle: "separate",
      colorVariationSpeed: 5,
      colorVividness: 5,
    },
  },
  {
    name: "Order through chaos",
    params: {
      speed: 2,
      noiseSpeed: 5,
      shapeRadius: 9,
      length: 6,
      noiseCount: 21,
      noiseMovement: "teleportation",
      solutionShape: "circle",
      solutionDirection: "clockwise",
      noiseDirection: "clockwise",
      solutionStyle: "global",
      colorVariationSpeed: 2,
      colorVividness: 10,
    },
  },
  {
    name: "Can you spot the circle?",
    params: {
      solutionStyle: "global",
      solutionShape: "circle",
      speed: 4,
      noiseMovement: "vibrate",
      noiseSpeed: 3,
      colorVariationSpeed: 5,
      shapeRadius: 6,
    },
  },
  {
    name: "Can you spot the circles?",
    params: {
      speed: 5,
      noiseSpeed: 5,
      shapeRadius: 5,
      length: 5,
      noiseCount: 15,
      noiseMovement: "vibrate",
      solutionShape: "circle",
      solutionDirection: "clockwise",
      noiseDirection: "clockwise",
      solutionStyle: "separate",
      colorVariationSpeed: 5,
    },
  },
];

const PARAM_KEYS = [
  "speed",
  "noiseSpeed",
  "shapeRadius",
  "length",
  "noiseCount",
  "noiseMovement",
  "solutionShape",
  "solutionDirection",
  "noiseDirection",
  "solutionStyle",
  "colorVariationSpeed",
  "colorVividness",
];

function readParams() {
  return {
    speed: Number(document.getElementById("param-speed").value),
    noiseSpeed: Number(document.getElementById("param-noise-speed").value),
    shapeRadius: Number(document.getElementById("param-shape-radius").value),
    length: Number(document.getElementById("param-length").value),
    noiseCount: Number(document.getElementById("param-noise").value),
    noiseMovement: document.getElementById("param-noise-movement").value,
    solutionShape: document.getElementById("param-solution-shape").value,
    solutionDirection: document.getElementById("param-solution-direction")
      .value,
    noiseDirection: document.getElementById("param-noise-direction").value,
    solutionStyle: document.getElementById("param-solution-style").value,
    colorVariationSpeed: Number(
      document.getElementById("param-color-speed").value,
    ),
    colorVividness: Number(
      document.getElementById("param-color-vividness").value,
    ),
  };
}

function paramsToSearchParams(params) {
  const search = new URLSearchParams();
  for (const key of PARAM_KEYS) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== "") {
      search.set(key, String(val));
    }
  }
  return search;
}

function searchParamsToParams(search) {
  const params = {};
  const speed = search.get("speed");
  if (speed != null) params.speed = Number(speed);
  const noiseSpeed = search.get("noiseSpeed");
  if (noiseSpeed != null) params.noiseSpeed = Number(noiseSpeed);
  const shapeRadius = search.get("shapeRadius");
  if (shapeRadius != null) params.shapeRadius = Number(shapeRadius);
  const length = search.get("length");
  if (length != null) params.length = Number(length);
  const noiseCount = search.get("noiseCount");
  if (noiseCount != null) params.noiseCount = Number(noiseCount);
  const noiseMovement = search.get("noiseMovement");
  if (noiseMovement != null) params.noiseMovement = noiseMovement;
  const solutionShape = search.get("solutionShape");
  if (solutionShape != null) params.solutionShape = solutionShape;
  const solutionDirection = search.get("solutionDirection");
  if (solutionDirection != null) params.solutionDirection = solutionDirection;
  const noiseDirection = search.get("noiseDirection");
  if (noiseDirection != null) params.noiseDirection = noiseDirection;
  const solutionStyle = search.get("solutionStyle");
  if (solutionStyle != null) params.solutionStyle = solutionStyle;
  const colorVariationSpeed = search.get("colorVariationSpeed");
  if (colorVariationSpeed != null)
    params.colorVariationSpeed = Number(colorVariationSpeed);
  const colorVividness = search.get("colorVividness");
  if (colorVividness != null) params.colorVividness = Number(colorVividness);
  return params;
}

function applyParamsToForm(params) {
  const def = readParams();
  const merged = { ...def, ...params };
  const speedEl = document.getElementById("param-speed");
  if (merged.speed != null) {
    speedEl.value = merged.speed;
    document.getElementById("param-speed-value").textContent = merged.speed;
  }
  const noiseSpeedEl = document.getElementById("param-noise-speed");
  if (merged.noiseSpeed != null) {
    noiseSpeedEl.value = merged.noiseSpeed;
    document.getElementById("param-noise-speed-value").textContent =
      merged.noiseSpeed;
  }
  const shapeRadiusEl = document.getElementById("param-shape-radius");
  if (merged.shapeRadius != null) {
    shapeRadiusEl.value = merged.shapeRadius;
    document.getElementById("param-shape-radius-value").textContent =
      merged.shapeRadius;
  }
  const lengthEl = document.getElementById("param-length");
  if (merged.length != null) {
    lengthEl.value = merged.length;
    document.getElementById("param-length-value").textContent = merged.length;
  }
  const noiseEl = document.getElementById("param-noise");
  if (merged.noiseCount != null) {
    noiseEl.value = merged.noiseCount;
    document.getElementById("param-noise-value").textContent =
      merged.noiseCount;
  }
  if (merged.noiseMovement != null)
    document.getElementById("param-noise-movement").value =
      merged.noiseMovement;
  if (merged.solutionShape != null)
    document.getElementById("param-solution-shape").value =
      merged.solutionShape;
  if (merged.solutionDirection != null)
    document.getElementById("param-solution-direction").value =
      merged.solutionDirection;
  if (merged.noiseDirection != null)
    document.getElementById("param-noise-direction").value =
      merged.noiseDirection;
  if (merged.solutionStyle != null)
    document.getElementById("param-solution-style").value =
      merged.solutionStyle;
  const colorSpeedEl = document.getElementById("param-color-speed");
  if (merged.colorVariationSpeed != null) {
    colorSpeedEl.value = merged.colorVariationSpeed;
    document.getElementById("param-color-speed-value").textContent =
      merged.colorVariationSpeed;
  }
  const colorVividnessEl = document.getElementById("param-color-vividness");
  if (merged.colorVividness != null) {
    colorVividnessEl.value = merged.colorVividness;
    document.getElementById("param-color-vividness-value").textContent =
      merged.colorVividness;
  }
}

function updateURLFromParams() {
  const presetSelect = document.getElementById("param-preset");
  const isDefaultPreset = presetSelect && presetSelect.value === "0";
  if (isDefaultPreset) {
    history.replaceState(null, "", location.pathname);
    return;
  }
  const params = readParams();
  const search = paramsToSearchParams(params);
  const qs = search.toString();
  const url = qs ? `${location.pathname}?${qs}` : location.pathname;
  history.replaceState(null, "", url);
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("captcha-container");
  const resetBtn = document.getElementById("reset-btn");
  const presetSelect = document.getElementById("param-preset");

  let resizeDebounceId = null;
  let lastParamInitTime = 0;
  function initFromParams() {
    if (resizeDebounceId) {
      clearTimeout(resizeDebounceId);
      resizeDebounceId = null;
    }
    lastParamInitTime = Date.now();
    initCaptcha(container, readParams());
  }

  // Populate presets
  for (let i = 0; i < PRESETS.length; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = PRESETS[i].name;
    presetSelect.appendChild(opt);
  }

  function applyPreset(index) {
    const preset = PRESETS[Number(index)];
    if (preset) {
      applyParamsToForm(preset.params);
      initFromParams();
      updateURLFromParams();
    }
  }

  presetSelect.addEventListener("change", () => {
    const val = presetSelect.value;
    if (val !== "") applyPreset(val);
  });

  // Restore params from URL if present, else use default preset
  const urlParams = searchParamsToParams(new URLSearchParams(location.search));
  if (Object.keys(urlParams).length > 0) {
    applyParamsToForm(urlParams);
  } else {
    applyParamsToForm(PRESETS[0].params);
    presetSelect.value = "0";
  }
  updateURLFromParams();

  initFromParams();

  resetBtn.addEventListener("click", initFromParams);

  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeDebounceId);
    resizeDebounceId = setTimeout(() => {
      resizeDebounceId = null;
      if (Date.now() - lastParamInitTime < 300) return;
      initCaptcha(container, readParams(), { preserveSolution: true });
    }, 150);
  });
  resizeObserver.observe(container);

  window.addEventListener("popstate", () => {
    const urlParams = searchParamsToParams(
      new URLSearchParams(location.search),
    );
    if (Object.keys(urlParams).length > 0) {
      applyParamsToForm(urlParams);
      initFromParams();
    }
  });

  function clearPresetSelection() {
    presetSelect.value = "";
  }

  let rangeDebounceId = null;
  function bindRange(id, valueId, onInit) {
    const el = document.getElementById(id);
    const valueEl = document.getElementById(valueId);
    el.addEventListener("input", (e) => {
      valueEl.textContent = e.target.value;
      updateURLFromParams();
      clearPresetSelection();
      if (onInit) {
        clearTimeout(rangeDebounceId);
        rangeDebounceId = setTimeout(() => {
          rangeDebounceId = null;
          onInit();
        }, 450);
      }
    });
    el.addEventListener("change", () => {
      valueEl.textContent = el.value;
      updateURLFromParams();
      clearPresetSelection();
      if (rangeDebounceId) {
        clearTimeout(rangeDebounceId);
        rangeDebounceId = null;
      }
      onInit?.();
    });
  }

  bindRange("param-speed", "param-speed-value", initFromParams);
  bindRange("param-noise-speed", "param-noise-speed-value", initFromParams);
  bindRange("param-shape-radius", "param-shape-radius-value", initFromParams);
  bindRange("param-length", "param-length-value", initFromParams);
  bindRange("param-noise", "param-noise-value", initFromParams);
  bindRange("param-color-speed", "param-color-speed-value", initFromParams);
  bindRange(
    "param-color-vividness",
    "param-color-vividness-value",
    initFromParams,
  );

  const paramSelects = [
    "param-noise-movement",
    "param-solution-shape",
    "param-solution-direction",
    "param-noise-direction",
    "param-solution-style",
  ];

  paramSelects.forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      updateURLFromParams();
      clearPresetSelection();
      initFromParams();
    });
  });

  // Param help tooltips via Popover API
  const popoverSupported = "showPopover" in document.createElement("div");
  document.querySelectorAll(".param-help[data-popover]").forEach((btn) => {
    const popoverId = btn.dataset.popover;
    const popover = document.getElementById(popoverId);
    if (!popover) return;
    if (popoverSupported && popover.popover !== undefined) {
      popover.addEventListener("toggle", (e) => {
        if (e.newState === "open" && e.source) {
          const rect = e.source.getBoundingClientRect();
          popover.style.top = `${rect.top + rect.height / 2}px`;
          popover.style.left = `${rect.left + rect.width + 8}px`;
        }
      });
      btn.addEventListener("mouseover", () => {
        if (!popover.matches(":popover-open"))
          popover.showPopover({ source: btn });
      });
      btn.addEventListener("mouseout", () => popover.hidePopover());
      btn.addEventListener("focus", () => {
        if (!popover.matches(":popover-open"))
          popover.showPopover({ source: btn });
      });
      btn.addEventListener("blur", () => popover.hidePopover());
    }
  });
});
