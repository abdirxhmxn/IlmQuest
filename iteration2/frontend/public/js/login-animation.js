(function initLoginAnimation() {
  "use strict";

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function mix(start, end, amount) {
    return start + (end - start) * amount;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutExpo(t) {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function easeOutBack(t) {
    var c1 = 1.70158;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function dampedWave(t, cycles, falloff) {
    return Math.sin(t * Math.PI * cycles) * Math.pow(1 - t, falloff);
  }

  /* Primary tweak zone:
     - Change `phases` to retime the 5s sequence.
     - Change `introMotion` and `settleMotion` to make the logo entrance softer or more dramatic.
     - Change `trail`, `particles`, and `pulse` to adjust polish without touching render math below. */
  var SPLASH_TUNING = {
    phases: {
      /* Keep `totalDuration` aligned with the `data-duration` attribute in the markup. */
      totalDuration: 5000,
      introEnd: 950,
      settleEnd: 2550,
      particlesStart: 960,
      textStart: 2800,
      textDuration: 1600,
      pulseStart: 4000
    },
    introMotion: {
      startYOffset: 64,
      endYOffset: -6,
      startRotation: -0.2,
      settleRotation: 0.04,
      startScale: 0.76,
      overshootScale: 1.045
    },
    settleMotion: {
      bounceCycles: 3.1,
      bounceFalloff: 2.85,
      scaleBounce: 0.024,
      rotationBounce: 0.016,
      yBounce: 8
    },
    trail: {
      layers: 3,
      offsetX: 9,
      offsetY: 11,
      rotation: 0.032,
      scaleLoss: 0.028,
      blurBase: 12,
      blurStep: 5,
      minVisibleStrength: 0.03
    },
    particles: {
      count: 26,
      duration: 2000,
      burstBoost: 1.28
    },
    pulse: {
      compositionScale: 0.018,
      baseGlow: 0.4,
      endGlow: 0.76
    },
    audio: {
      whooshDuration: 1.02,
      textCueMs: 2820,
      finalCueMs: 4060
    }
  };

  function createNoiseBuffer(context, duration) {
    var length = Math.max(1, Math.floor(context.sampleRate * duration));
    var buffer = context.createBuffer(1, length, context.sampleRate);
    var data = buffer.getChannelData(0);
    var lastValue = 0;
    var index = 0;

    for (index = 0; index < length; index += 1) {
      var white = Math.random() * 2 - 1;
      lastValue = (lastValue * 0.76) + (white * 0.24);
      data[index] = lastValue;
    }

    return buffer;
  }

  function playEntranceWhoosh(context, startTime) {
    var duration = SPLASH_TUNING.audio.whooshDuration;
    var noise = context.createBufferSource();
    var filter = context.createBiquadFilter();
    var gain = context.createGain();
    var subOsc = context.createOscillator();
    var subGain = context.createGain();

    noise.buffer = createNoiseBuffer(context, duration);
    filter.type = "bandpass";
    filter.Q.value = 1.25;
    filter.frequency.setValueAtTime(180, startTime);
    filter.frequency.exponentialRampToValueAtTime(3400, startTime + (duration * 0.42));
    filter.frequency.exponentialRampToValueAtTime(320, startTime + duration);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.19, startTime + (duration * 0.16));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(62, startTime);
    subOsc.frequency.exponentialRampToValueAtTime(112, startTime + (duration * 0.38));
    subOsc.frequency.exponentialRampToValueAtTime(48, startTime + duration);

    subGain.gain.setValueAtTime(0.0001, startTime);
    subGain.gain.exponentialRampToValueAtTime(0.052, startTime + (duration * 0.11));
    subGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);

    subOsc.connect(subGain);
    subGain.connect(context.destination);

    noise.start(startTime);
    noise.stop(startTime + duration);
    subOsc.start(startTime);
    subOsc.stop(startTime + duration);
  }

  function playSparkleChime(context, startTime) {
    var notes = [880, 1174.66, 1567.98, 2093];
    var noteLength = 0.84;
    var delay = context.createDelay(0.5);
    var feedback = context.createGain();
    var wet = context.createGain();

    delay.delayTime.value = 0.16;
    feedback.gain.value = 0.18;
    wet.gain.value = 0.12;

    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(context.destination);

    notes.forEach(function (frequency, index) {
      var oscillator = context.createOscillator();
      var gain = context.createGain();
      var noteStart = startTime + (index * 0.06);

      oscillator.type = index % 2 === 0 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.985, noteStart + noteLength);

      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.045, noteStart + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteLength);

      oscillator.connect(gain);
      gain.connect(context.destination);
      gain.connect(delay);

      oscillator.start(noteStart);
      oscillator.stop(noteStart + noteLength);
    });
  }

  function playFinalTone(context, startTime) {
    var oscillators = [
      { type: "sine", frequency: 261.63, gain: 0.05 },
      { type: "triangle", frequency: 392, gain: 0.028 }
    ];

    oscillators.forEach(function (config) {
      var oscillator = context.createOscillator();
      var gain = context.createGain();
      var duration = 0.9;

      oscillator.type = config.type;
      oscillator.frequency.setValueAtTime(config.frequency, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(config.frequency * 1.018, startTime + duration);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(config.gain, startTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    });
  }

  function extractLogoMark(image) {
    var sourceCanvas = document.createElement("canvas");
    var context = sourceCanvas.getContext("2d");
    var renderSize = 720;
    var cropX = image.width * 0.11;
    var cropY = image.height * 0.04;
    var cropWidth = image.width * 0.78;
    var cropHeight = image.height * 0.68;
    var imageData;
    var pixels;
    var index = 0;

    sourceCanvas.width = renderSize;
    sourceCanvas.height = renderSize;

    context.drawImage(
      image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      renderSize,
      renderSize
    );

    imageData = context.getImageData(0, 0, renderSize, renderSize);
    pixels = imageData.data;

    for (index = 0; index < pixels.length; index += 4) {
      var red = pixels[index];
      var green = pixels[index + 1];
      var blue = pixels[index + 2];
      var alpha = pixels[index + 3];
      var maxChannel = Math.max(red, green, blue);
      var minChannel = Math.min(red, green, blue);
      var chroma = maxChannel - minChannel;
      var luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);

      if (luminance > 210 && chroma < 46) {
        pixels[index + 3] = 0;
        continue;
      }

      if (luminance > 176 && chroma < 66) {
        var retention = clamp((208 - luminance) / 32, 0, 1) * clamp(chroma / 50, 0.28, 1);
        pixels[index + 3] = Math.round(alpha * retention);
      }

      pixels[index] = clamp(Math.round(((red - 18) * 1.08) + 18), 0, 255);
      pixels[index + 1] = clamp(Math.round(((green - 16) * 1.1) + 16), 0, 255);
      pixels[index + 2] = clamp(Math.round(((blue - 16) * 1.12) + 16), 0, 255);
    }

    context.putImageData(imageData, 0, 0);
    return sourceCanvas;
  }

  function LoginSplash(root) {
    this.root = root;
    this.canvas = root.querySelector("[data-login-animation-canvas]");
    this.wordmark = root.querySelector("[data-login-animation-wordmark]");
    this.composition = root.querySelector("[data-login-animation-composition]");
    this.replayButton = root.querySelector("[data-login-animation-replay]");
    this.duration = Number(root.getAttribute("data-duration") || SPLASH_TUNING.phases.totalDuration);
    this.redirectUrl = String(root.getAttribute("data-redirect-url") || "");
    this.logoSrc = String(root.getAttribute("data-logo-src") || "/imgs/finalLogo.jpg");
    this.previewMode = root.getAttribute("data-preview-mode") === "true";
    this.hideOnComplete = root.getAttribute("data-hide-on-complete") === "true";
    this.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.particles = this.createParticles();
    this.frameId = 0;
    this.completed = false;
    this.animationStart = 0;
    this.logoCanvas = null;
    this.audioContext = null;
    this.audioStarted = false;
    this.prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  LoginSplash.prototype.createParticles = function createParticles() {
    var particles = [];
    var total = SPLASH_TUNING.particles.count;
    var index = 0;

    for (index = 0; index < total; index += 1) {
      particles.push({
        angle: ((Math.PI * 2) * index / total) + ((Math.random() - 0.5) * 0.42),
        distance: 74 + (Math.random() * 132),
        lift: 18 + (Math.random() * 42),
        size: 2.4 + (Math.random() * 4.8),
        delay: Math.random() * 260,
        orbit: (Math.random() - 0.5) * 26,
        alpha: 0.34 + (Math.random() * 0.42),
        hueShift: Math.random() > 0.48 ? 0 : 1
      });
    }

    return particles;
  };

  LoginSplash.prototype.bindReplay = function bindReplay() {
    var instance = this;

    if (!this.replayButton) return;
    this.replayButton.addEventListener("click", function () {
      window.location.reload();
    });

    if (!this.previewMode) {
      this.replayButton.hidden = true;
      return;
    }

    this.replayButton.hidden = false;
    setTimeout(function () {
      instance.replayButton.hidden = false;
    }, 0);
  };

  LoginSplash.prototype.prepareCanvas = function prepareCanvas() {
    var rect = this.canvas.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width * this.devicePixelRatio));
    var height = Math.max(1, Math.round(rect.height * this.devicePixelRatio));

    if (this.canvas.width === width && this.canvas.height === height) return;

    this.canvas.width = width;
    this.canvas.height = height;
  };

  LoginSplash.prototype.scheduleAudio = function scheduleAudio() {
    var AudioContextConstructor;
    var context;
    var instance = this;
    var scheduleSequence;

    if (this.prefersReducedMotion || this.audioStarted) return;

    if (!this.audioContext) {
      AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) return;

      try {
        this.audioContext = new AudioContextConstructor();
      } catch (error) {
        this.audioContext = null;
        return;
      }
    }

    context = this.audioContext;
    scheduleSequence = function () {
      var startTime;

      if (instance.audioStarted) return;

      startTime = context.currentTime + 0.03;
      playEntranceWhoosh(context, startTime);
      playSparkleChime(context, startTime + (SPLASH_TUNING.audio.textCueMs / 1000));
      playFinalTone(context, startTime + (SPLASH_TUNING.audio.finalCueMs / 1000));
      instance.audioStarted = true;
    };

    if (context.state === "running") {
      scheduleSequence();
      return;
    }

    context.resume().then(scheduleSequence).catch(function () {});
  };

  LoginSplash.prototype.tryUnlockAudio = function tryUnlockAudio() {
    var instance = this;
    var unlock;

    unlock = function unlockAudio() {
      if (instance.audioStarted) return;
      instance.scheduleAudio();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };

    unlock();

    if (!this.audioStarted) {
      document.addEventListener("pointerdown", unlock, { once: true });
      document.addEventListener("keydown", unlock, { once: true });
    }
  };

  LoginSplash.prototype.loadLogo = function loadLogo() {
    var instance = this;

    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.decoding = "async";
      image.onload = function () {
        instance.logoCanvas = extractLogoMark(image);
        resolve();
      };
      image.onerror = reject;
      image.src = instance.logoSrc;
    });
  };

  LoginSplash.prototype.drawGlowField = function drawGlowField(context, centerX, centerY, size, progress) {
    var gradient = context.createRadialGradient(
      centerX,
      centerY,
      size * 0.08,
      centerX,
      centerY,
      size * 0.84
    );
    var pulseGlow = mix(0.34, 0.7, progress);

    gradient.addColorStop(0, "rgba(110, 247, 255, 0.28)");
    gradient.addColorStop(0.22, "rgba(92, 236, 255, 0.18)");
    gradient.addColorStop(0.52, "rgba(76, 246, 203, 0.10)");
    gradient.addColorStop(1, "rgba(2, 5, 13, 0)");

    context.save();
    context.globalAlpha = pulseGlow * 0.82;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centerX, centerY, size * 0.82, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  LoginSplash.prototype.drawLogoLayer = function drawLogoLayer(context, state, layerOptions) {
    var width = this.canvas.getBoundingClientRect().width;
    var height = this.canvas.getBoundingClientRect().height;
    var centerX = width / 2;
    var centerY = height / 2;
    var drawSize = Math.min(width, height) * 0.94;
    var shift = (((state.elapsed / this.duration) * 1.85) % 1) * drawSize;
    var gradient;
    var shimmer;

    context.save();
    context.translate(centerX + layerOptions.offsetX, centerY + layerOptions.offsetY);
    context.rotate(state.rotation + layerOptions.rotationOffset);
    context.scale(state.scale * layerOptions.scaleMultiplier, state.scale * layerOptions.scaleMultiplier);
    context.globalAlpha = layerOptions.alpha;

    if (layerOptions.blur > 0) {
      context.filter = "blur(" + layerOptions.blur + "px) saturate(1.22)";
    }

    context.drawImage(
      this.logoCanvas,
      -drawSize / 2,
      -drawSize / 2,
      drawSize,
      drawSize
    );

    context.filter = "none";
    context.globalCompositeOperation = "source-atop";

    gradient = context.createLinearGradient(
      -drawSize + shift,
      -drawSize * 0.3,
      drawSize + shift,
      drawSize * 0.26
    );
    gradient.addColorStop(0, "rgba(32, 118, 255, 0)");
    gradient.addColorStop(0.25, "rgba(32, 118, 255, 0.14)");
    gradient.addColorStop(0.48, "rgba(92, 236, 255, 0.26)");
    gradient.addColorStop(0.66, "rgba(76, 246, 203, 0.3)");
    gradient.addColorStop(1, "rgba(76, 246, 203, 0)");

    context.globalAlpha = layerOptions.alpha * layerOptions.sheenStrength;
    context.fillStyle = gradient;
    context.fillRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize);

    shimmer = context.createRadialGradient(
      (Math.cos(state.elapsed / 560) * drawSize * 0.16),
      (-drawSize * 0.08) + (Math.sin(state.elapsed / 640) * drawSize * 0.08),
      0,
      0,
      0,
      drawSize * 0.58
    );
    shimmer.addColorStop(0, "rgba(216, 250, 255, 0.22)");
    shimmer.addColorStop(0.22, "rgba(92, 236, 255, 0.12)");
    shimmer.addColorStop(1, "rgba(92, 236, 255, 0)");

    context.globalAlpha = layerOptions.alpha * 0.82;
    context.fillStyle = shimmer;
    context.fillRect(-drawSize / 2, -drawSize / 2, drawSize, drawSize);

    context.restore();
    context.globalCompositeOperation = "source-over";
  };

  LoginSplash.prototype.drawParticles = function drawParticles(context, elapsed) {
    var width = this.canvas.getBoundingClientRect().width;
    var height = this.canvas.getBoundingClientRect().height;
    var centerX = width / 2;
    var centerY = height / 2;
    var instance = this;
    var particleStart = SPLASH_TUNING.phases.particlesStart;
    var particleDuration = SPLASH_TUNING.particles.duration;

    this.particles.forEach(function (particle, index) {
      var localTime = elapsed - particleStart - particle.delay;
      var progress;
      var burst;
      var floatLift;
      var x;
      var y;
      var radius;
      var twinkle;
      var sparkleRadius;
      var particleGradient;

      if (localTime <= 0) return;

      progress = clamp(localTime / particleDuration, 0, 1);
      burst = easeOutExpo(Math.min(progress * SPLASH_TUNING.particles.burstBoost, 1));
      floatLift = Math.max(0, progress - 0.34) * particle.lift;
      x = centerX + (Math.cos(particle.angle) * particle.distance * burst) + (Math.cos(elapsed / 420 + index) * particle.orbit * progress * 0.2);
      y = centerY + (Math.sin(particle.angle) * particle.distance * 0.74 * burst) - floatLift;
      radius = particle.size * (1.08 - (progress * 0.38));
      twinkle = 0.68 + (0.32 * Math.sin((elapsed / 120) + index));
      sparkleRadius = radius * (1.5 + (0.18 * Math.sin(elapsed / 160 + index)));

      context.save();
      context.globalAlpha = particle.alpha * Math.pow(1 - progress, 0.54) * twinkle;
      particleGradient = context.createRadialGradient(x, y, 0, x, y, radius * 2.6);

      if (particle.hueShift === 0) {
        particleGradient.addColorStop(0, "rgba(220, 251, 255, 0.95)");
        particleGradient.addColorStop(0.34, "rgba(92, 236, 255, 0.7)");
        particleGradient.addColorStop(1, "rgba(92, 236, 255, 0)");
      } else {
        particleGradient.addColorStop(0, "rgba(228, 255, 245, 0.95)");
        particleGradient.addColorStop(0.34, "rgba(76, 246, 203, 0.68)");
        particleGradient.addColorStop(1, "rgba(76, 246, 203, 0)");
      }

      context.fillStyle = particleGradient;
      context.beginPath();
      context.arc(x, y, radius * 2, 0, Math.PI * 2);
      context.fill();

      if (index % 4 === 0) {
        context.strokeStyle = particle.hueShift === 0
          ? "rgba(211, 249, 255, 0.78)"
          : "rgba(215, 255, 242, 0.72)";
        context.lineWidth = 1.1;
        context.beginPath();
        context.moveTo(x - sparkleRadius, y);
        context.lineTo(x + sparkleRadius, y);
        context.moveTo(x, y - sparkleRadius);
        context.lineTo(x, y + sparkleRadius);
        context.stroke();
      }

      context.restore();
    });

    instance = null;
  };

  LoginSplash.prototype.render = function render(elapsed) {
    var context = this.canvas.getContext("2d");
    var rect = this.canvas.getBoundingClientRect();
    var phases = SPLASH_TUNING.phases;
    var introDuration = phases.introEnd;
    var settleDuration = Math.max(1, phases.settleEnd - phases.introEnd);
    var pulseDuration = Math.max(1, this.duration - phases.pulseStart);
    var intro = clamp(elapsed / introDuration, 0, 1);
    var settle = clamp((elapsed - phases.introEnd) / settleDuration, 0, 1);
    var wordmark = clamp((elapsed - phases.textStart) / phases.textDuration, 0, 1);
    var pulse = clamp((elapsed - phases.pulseStart) / pulseDuration, 0, 1);
    var drawWidth = rect.width;
    var drawHeight = rect.height;
    var introEase = easeOutCubic(intro);
    var settleEase = easeOutCubic(settle);
    var entranceYOffset = mix(SPLASH_TUNING.introMotion.startYOffset, SPLASH_TUNING.introMotion.endYOffset, introEase);
    var entranceRotation = mix(SPLASH_TUNING.introMotion.startRotation, SPLASH_TUNING.introMotion.settleRotation, introEase);
    var entranceScale = mix(SPLASH_TUNING.introMotion.startScale, SPLASH_TUNING.introMotion.overshootScale, introEase);
    var bounceWave = dampedWave(
      settle,
      SPLASH_TUNING.settleMotion.bounceCycles,
      SPLASH_TUNING.settleMotion.bounceFalloff
    );
    var pulseWave = Math.sin(pulse * Math.PI);
    var state;
    var trailStrength = 1 - easeOutCubic(intro);
    var trailIndex = 0;
    var textEase = easeOutCubic(wordmark);
    var compositionScale = 1 + (pulseWave * SPLASH_TUNING.pulse.compositionScale);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);

    state = {
      elapsed: elapsed,
      scale: settle > 0
        ? mix(SPLASH_TUNING.introMotion.overshootScale, 1, settleEase) + (bounceWave * SPLASH_TUNING.settleMotion.scaleBounce)
        : entranceScale,
      rotation: settle > 0
        ? mix(SPLASH_TUNING.introMotion.settleRotation, 0, easeOutBack(settle)) + (bounceWave * SPLASH_TUNING.settleMotion.rotationBounce)
        : entranceRotation,
      offsetY: settle > 0
        ? mix(SPLASH_TUNING.introMotion.endYOffset, 0, settleEase) + (bounceWave * SPLASH_TUNING.settleMotion.yBounce)
        : entranceYOffset
    };

    this.root.style.setProperty("--login-splash-composition-scale", compositionScale.toFixed(4));
    this.root.style.setProperty(
      "--login-splash-glow-strength",
      mix(SPLASH_TUNING.pulse.baseGlow, SPLASH_TUNING.pulse.endGlow, pulse).toFixed(4)
    );
    this.root.style.setProperty("--login-splash-wordmark-opacity", textEase.toFixed(4));
    this.root.style.setProperty("--login-splash-wordmark-shift", mix(24, 0, textEase).toFixed(2) + "px");
    this.root.style.setProperty("--login-splash-wordmark-scale", mix(0.96, 1, easeInOutCubic(wordmark)).toFixed(4));
    this.root.style.setProperty("--login-splash-wordmark-blur", mix(18, 0, textEase).toFixed(2) + "px");

    this.drawGlowField(context, drawWidth / 2, drawHeight / 2, Math.min(drawWidth, drawHeight), pulse);

    for (trailIndex = SPLASH_TUNING.trail.layers; trailIndex >= 1; trailIndex -= 1) {
      if (trailStrength <= SPLASH_TUNING.trail.minVisibleStrength) break;
      this.drawLogoLayer(context, state, {
        offsetX: -trailIndex * SPLASH_TUNING.trail.offsetX * trailStrength,
        offsetY: state.offsetY + (trailIndex * SPLASH_TUNING.trail.offsetY * trailStrength),
        rotationOffset: -trailIndex * SPLASH_TUNING.trail.rotation * trailStrength,
        scaleMultiplier: 1 - (trailIndex * SPLASH_TUNING.trail.scaleLoss * trailStrength),
        alpha: 0.08 + (((SPLASH_TUNING.trail.layers - trailIndex) + 1) * 0.012),
        blur: SPLASH_TUNING.trail.blurBase + (trailIndex * SPLASH_TUNING.trail.blurStep),
        sheenStrength: 0.48
      });
    }

    this.drawLogoLayer(context, state, {
      offsetX: 0,
      offsetY: state.offsetY,
      rotationOffset: 0,
      scaleMultiplier: 1,
      alpha: 0.2 + (pulse * 0.05),
      blur: 24,
      sheenStrength: 0.82
    });

    this.drawLogoLayer(context, state, {
      offsetX: 0,
      offsetY: state.offsetY,
      rotationOffset: 0,
      scaleMultiplier: 1,
      alpha: 1,
      blur: 0,
      sheenStrength: 1
    });

    if (elapsed >= phases.particlesStart) {
      this.drawParticles(context, elapsed);
    }
  };

  LoginSplash.prototype.complete = function complete() {
    if (this.completed) return;

    this.completed = true;
    cancelAnimationFrame(this.frameId);

    if (this.redirectUrl) {
      window.location.replace(this.redirectUrl);
      return;
    }

    if (this.previewMode) {
      this.root.classList.add("is-preview-complete");
      return;
    }

    if (this.hideOnComplete) {
      this.root.classList.add("is-hidden");
    }
  };

  LoginSplash.prototype.start = function start() {
    var instance = this;
    var resizeHandler = function () {
      instance.prepareCanvas();
    };
    var step = function (timestamp) {
      var elapsed;

      if (!instance.animationStart) {
        instance.animationStart = timestamp;
      }

      elapsed = Math.min(timestamp - instance.animationStart, instance.duration);
      instance.render(elapsed);

      if (elapsed >= instance.duration) {
        instance.complete();
        return;
      }

      instance.frameId = window.requestAnimationFrame(step);
    };

    this.bindReplay();
    this.prepareCanvas();
    window.addEventListener("resize", resizeHandler);
    this.tryUnlockAudio();
    this.frameId = window.requestAnimationFrame(step);
  };

  function bootstrap() {
    var roots = Array.prototype.slice.call(
      document.querySelectorAll("[data-login-animation]")
    );

    roots.forEach(function (root) {
      var splash = new LoginSplash(root);

      splash.loadLogo()
        .then(function () {
          splash.start();
        })
        .catch(function () {
          splash.complete();
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
