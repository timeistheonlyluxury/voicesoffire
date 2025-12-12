class ImgPlayer {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.video = document.getElementById("fallback-video");
    this.audio = document.getElementById("background-audio");
    this.loading = document.getElementById("loading");
    this.progressText = document.getElementById("progress");

    this.images = new Array(CONFIG.frameCount);
    this.loadedCount = 0;
    this.currentFrame = 0;
    this.isVideoMode = false;
    this.isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    this.mouseX = 0;
    this.gyroTilt = 0;

    this.supportsAVIF = false;
    this.imageFormat = null;

    // Audio state
    this.audioReady = false;
    this.isAudioPlaying = false;
    this.isFading = false;
    this.wasPlayingBeforeHidden = false;

    // Fade-in state
    this.fadeInApplied = false;

    this.init();
  }

  async init() {
    this.setupCanvas();
    this.setupGradient();
    this.setupAudio();
    this.setupVisibilityHandling();
    await this.detectAVIFSupport();
    this.preloadImages();
    window.addEventListener("resize", () => this.setupCanvas());
  }

  setupVisibilityHandling() {
    // Handle tab visibility changes (pause audio when tab is hidden)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        // Tab is hidden - pause audio
        if (this.isAudioPlaying && !this.audio.paused) {
          this.audio.pause();
          this.wasPlayingBeforeHidden = true;
        }
      } else {
        // Tab is visible again - resume audio if it was playing
        if (this.wasPlayingBeforeHidden && this.audioReady) {
          this.audio
            .play()
            .catch((err) => console.error("Resume audio failed:", err));
          this.wasPlayingBeforeHidden = false;
        }
      }
    });
  }

  setupAudio() {
    this.audio.src = CONFIG.audio.file;
    this.audio.volume = this.isMobile ? CONFIG.audio.volume : 0;
    this.audio.muted = this.isMobile; // Start muted on mobile
    this.audio.load();

    this.audio.addEventListener("timeupdate", () => {
      // Different buffer times for mobile vs desktop (mobile needs more buffer for reliability)
      const buffer = this.isMobile ? 0.5 : 0.25; // Buffer time before end to restart (in seconds)
      // Only loop if audio should be playing (not paused and not fading out)
      if (
        this.audio.currentTime > this.audio.duration - buffer &&
        !this.audio.paused &&
        (this.isMobile || this.isAudioPlaying)
      ) {
        this.audio.currentTime = 0;
        this.audio
          .play()
          .catch((err) => console.error("Gapless loop restart failed:", err));
      }
    });
  }

  setupGradient() {
    // Set gradient opacity based on device type
    const intensity = this.isMobile
      ? CONFIG.gradientIntensity.mobile
      : CONFIG.gradientIntensity.desktop;
    const opacity = intensity / 100; // Convert 0-100 to 0-1
    document.body.style.setProperty("--gradient-opacity", opacity);
  }

  async detectAVIFSupport() {
    return new Promise((resolve) => {
      // Check if debug flag forces PNG usage
      if (CONFIG.forceUsePNG) {
        this.supportsAVIF = false;
        this.imageFormat = CONFIG.formats.fallback;
        console.log("DEBUG: forceUsePNG enabled - using PNG images");
        resolve();
        return;
      }

      const avif = new Image();
      avif.onload = () => {
        this.supportsAVIF = true;
        this.imageFormat = CONFIG.formats.avif;
        console.log("AVIF supported - using AVIF images");
        resolve();
      };
      avif.onerror = () => {
        this.supportsAVIF = false;
        this.imageFormat = CONFIG.formats.fallback;
        console.log("AVIF not supported - using fallback format");
        resolve();
      };
      // test avif image (1x1 pixel)
      avif.src =
        "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=";
    });
  }

  setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + "px";
    this.canvas.style.height = window.innerHeight + "px";
    this.ctx.scale(dpr, dpr);

    if (this.images[this.currentFrame]) {
      this.drawFrame(this.currentFrame);
    }
  }

  getFramePath(frameNumber) {
    const paddedNumber = String(frameNumber).padStart(CONFIG.frameDigits, "0");
    const folder = this.imageFormat.folder;
    const extension = this.imageFormat.extension;
    return `${CONFIG.imageFolder}/${folder}/${CONFIG.filePrefix}${paddedNumber}.${extension}`;
  }

  preloadImages() {
    // load every Nth frame at first for choppyish scrubbing, then fill in the gaps as everything loads
    const priorityFrames = [];
    const secondaryFrames = [];

    // primary: every Nth frame
    for (let i = 0; i < CONFIG.frameCount; i += CONFIG.initialLoadStep) {
      priorityFrames.push(i);
    }

    // secondary: all other frames
    for (let i = 0; i < CONFIG.frameCount; i++) {
      if (i % CONFIG.initialLoadStep !== 0) {
        secondaryFrames.push(i);
      }
    }

    // load priority frames first
    this.loadFrameBatch(priorityFrames, () => {
      // now load secondary frames
      this.loadFrameBatch(secondaryFrames, () => {
        console.log("all frames loaded!");
      });

      // allow mouse stuff now that primary frames are loaded
      this.startInteraction();
    });
  }

  loadFrameBatch(frameIndices, onComplete) {
    let batchLoaded = 0;
    const batchSize = frameIndices.length;

    if (batchSize === 0) {
      onComplete();
      return;
    }

    frameIndices.forEach((i) => {
      const img = new Image();
      img.onload = () => {
        this.images[i] = img;
        this.loadedCount++;
        batchLoaded++;

        const progress = Math.floor(
          (this.loadedCount / CONFIG.frameCount) * 100
        );
        this.progressText.textContent = progress;

        // get first frame immediately
        if (this.loadedCount === 1) {
          this.currentFrame = i;
          this.drawFrame(i);
        }

        if (batchLoaded === batchSize) {
          onComplete();
        }
      };
      img.onerror = () => {
        console.error(`Failed to load frame ${i}`);
        batchLoaded++;
        this.loadedCount++;
        if (batchLoaded === batchSize) {
          onComplete();
        }
      };
      img.src = this.getFramePath(i);
    });
  }

  startInteraction() {
    this.loading.style.opacity = "0";
    setTimeout(() => {
      this.loading.style.display = "none";
    }, 300);

    if (this.isMobile) {
      this.setupMobileControls();
    } else {
      this.setupDesktopControls();
      this.animate();
    }
  }

  enableAudio() {
    if (!this.audioReady) {
      this.audioReady = true;
      console.log("Audio enabled and ready");
    }
  }

  fadeInAudio() {
    if (this.isFading) return;

    if (!this.isAudioPlaying) {
      this.audio
        .play()
        .catch((err) => console.error("Audio play failed:", err));
      this.isAudioPlaying = true;
    }

    // Mobile: use direct unmute (iOS Safari doesn't support volume changes reliably)
    if (this.isMobile) {
      this.audio.muted = false;
      this.audio.volume = CONFIG.audio.volume;
      return;
    }

    // Desktop: use fade
    this.isFading = true;
    const startVolume = this.audio.volume;
    const targetVolume = CONFIG.audio.volume;
    const duration = CONFIG.audio.fadeDuration * 1000; // Convert to ms
    const startTime = Date.now();

    const fade = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      this.audio.volume = startVolume + (targetVolume - startVolume) * progress;

      if (progress < 1) {
        requestAnimationFrame(fade);
      } else {
        this.isFading = false;
      }
    };

    fade();
  }

  fadeOutAudio() {
    if (this.isFading) return;

    // Mobile: use direct mute (iOS Safari doesn't support volume changes reliably)
    // Keep playing but muted so it can quickly unmute when back in range
    if (this.isMobile) {
      this.audio.muted = true;
      return;
    }

    // Desktop: use fade
    this.isFading = true;
    const startVolume = this.audio.volume;
    const targetVolume = 0;
    const duration = CONFIG.audio.fadeDuration * 1000; // Convert to ms
    const startTime = Date.now();

    const fade = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      this.audio.volume = startVolume + (targetVolume - startVolume) * progress;

      if (progress < 1) {
        requestAnimationFrame(fade);
      } else {
        this.audio.pause();
        this.isAudioPlaying = false;
        this.isFading = false;
      }
    };

    fade();
  }

  updateAudioBasedOnFrame() {
    if (!this.audioReady) return;

    const inRange =
      this.currentFrame >= CONFIG.audio.startFrame &&
      this.currentFrame <= CONFIG.audio.endFrame;

    // On mobile, check muted state instead of isAudioPlaying (since audio stays playing when muted)
    const shouldBeAudible = this.isMobile
      ? !this.audio.muted
      : this.isAudioPlaying;

    if (inRange && !shouldBeAudible) {
      this.fadeInAudio();
    } else if (!inRange && shouldBeAudible) {
      this.fadeOutAudio();
    }
  }

  setupDesktopControls() {
    // Show permission screen for audio on desktop
    this.showPermissionButton();

    document.addEventListener("mousemove", (e) => {
      this.mouseX = e.clientX / window.innerWidth;
    });
  }

  setupMobileControls() {
    console.log("Setting up mobile controls...");
    console.log(
      "DeviceOrientationEvent available:",
      !!window.DeviceOrientationEvent
    );
    console.log(
      "requestPermission function:",
      typeof DeviceOrientationEvent?.requestPermission
    );

    if (
      window.DeviceOrientationEvent &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      // iOS 13+ requires user gesture to request permission
      console.log("iOS detected - showing permission button");
      this.showPermissionButton();
    } else if (window.DeviceOrientationEvent) {
      // android and older ios
      console.log("Android/older iOS detected - enabling gyroscope");
      this.enableGyroscope();
      this.animate();
    } else {
      // no gyroscope support
      console.log("No gyroscope support - using video fallback");
      this.enableVideoFallback();
    }
  }

  showPermissionButton() {
    const permissionDiv = document.getElementById("ios-permission");
    const button = document.getElementById("enable-gyro");

    console.log("Showing permission button");
    permissionDiv.style.display = "flex";

    // Setup button glow video
    this.setupButtonGlow(button);

    button.addEventListener("click", () => {
      console.log("Permission button clicked");

      // Enable audio for all devices
      this.enableAudio();

      // Check if this is iOS that needs gyroscope permission
      if (
        window.DeviceOrientationEvent &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        DeviceOrientationEvent.requestPermission()
          .then((response) => {
            console.log("Permission response:", response);
            if (response === "granted") {
              permissionDiv.style.display = "none";
              this.enableGyroscope();
              this.animate();
            } else {
              permissionDiv.style.display = "none";
              this.enableVideoFallback();
            }
          })
          .catch((error) => {
            console.error("Permission error:", error);
            permissionDiv.style.display = "none";
            this.enableVideoFallback();
          });
      } else {
        // Desktop - just start animation
        permissionDiv.style.display = "none";
        this.animate();
      }
    });
  }

  setupButtonGlow(button) {
    const glowVideo = document.getElementById("button-glow-video");
    if (!glowVideo || !CONFIG.buttonGlow) return;

    // Set video source
    glowVideo.src = CONFIG.buttonGlow.video;

    // Function to resize video based on button size
    const resizeGlow = () => {
      const buttonRect = button.getBoundingClientRect();
      const multiplier = CONFIG.buttonGlow.sizeMultiplier || 1.2;

      // Apply multiplier only to width, height will scale automatically to maintain aspect ratio
      const videoWidth = buttonRect.width * multiplier;

      glowVideo.style.width = `${videoWidth}px`;
      glowVideo.style.height = "auto";
    };

    // Resize on load and window resize
    glowVideo.addEventListener("loadedmetadata", resizeGlow);
    window.addEventListener("resize", resizeGlow);

    // Initial resize
    resizeGlow();

    // Play video
    glowVideo
      .play()
      .catch((err) => console.log("Glow video autoplay failed:", err));
  }

  enableGyroscope() {
    let baseGamma = null;

    window.addEventListener("deviceorientation", (e) => {
      // use gamma (left-right tilt)
      let gamma = e.gamma; // Range: -90 to 90

      if (gamma === null) return;

      // device orientation (portrait/landscape)
      if (Math.abs(window.orientation) === 90) {
        // Landscape mode - use beta instead
        gamma = e.beta - 90;
      }

      // set base position
      if (baseGamma === null) {
        baseGamma = gamma;
      }

      // calc relative tilt from base position
      const relativeTilt = gamma - baseGamma;

      // map tilt to 0-1 range
      const normalized =
        (relativeTilt + CONFIG.gyroSensitivity) / (CONFIG.gyroSensitivity * 2);
      this.gyroTilt = Math.max(0, Math.min(1, normalized));
    });

    // reset base position on touch
    document.addEventListener("touchstart", () => {
      // baseGamma = null;
    });
  }

  applyFadeIn(element) {
    if (!CONFIG.fadeIn || !CONFIG.fadeIn.enabled) {
      element.style.opacity = "1";
      return;
    }

    const duration = CONFIG.fadeIn.duration || 1.5;
    element.style.transition = `opacity ${duration}s ease-in`;

    // Trigger fade-in after a small delay to ensure transition works
    requestAnimationFrame(() => {
      element.classList.add("fade-in");
    });
  }

  enableVideoFallback() {
    console.log("Using video fallback");
    this.isVideoMode = true;
    this.canvas.style.display = "none";
    this.video.style.display = "block";
    this.video.src = CONFIG.fallbackVideo;

    if (this.isMobile) {
      document.body.style.setProperty("--video-scale", CONFIG.mobileViewScale);
      document.body.style.setProperty(
        "--video-offset-x",
        `${CONFIG.mobileViewOffsetX}vw`
      );
    }

    this.video.loop = true;

    this.video.play().catch((err) => {
      console.error("Video playback failed:", err);
    });

    // Apply fade-in effect
    this.applyFadeIn(this.video);
  }

  animate() {
    if (this.isVideoMode) return;

    // Apply fade-in effect to canvas on first animation call
    if (!this.fadeInApplied) {
      this.applyFadeIn(this.canvas);
      this.fadeInApplied = true;
    }

    const targetPosition = this.isMobile ? this.gyroTilt : this.mouseX;
    const targetFrame = Math.floor(targetPosition * (CONFIG.frameCount - 1));

    if (targetFrame !== this.currentFrame) {
      this.currentFrame = targetFrame;
      this.drawFrame(targetFrame);
    }

    // Always check audio (even if frame hasn't changed) for initial state
    this.updateAudioBasedOnFrame();

    requestAnimationFrame(() => this.animate());
  }

  drawFrame(frameIndex) {
    const img = this.images[frameIndex];

    if (!img) {
      // weird logic to load closest frame idk
      let nearest = frameIndex;
      let minDistance = CONFIG.frameCount;

      for (let i = 0; i < CONFIG.frameCount; i++) {
        if (this.images[i]) {
          const distance = Math.abs(i - frameIndex);
          if (distance < minDistance) {
            minDistance = distance;
            nearest = i;
          }
        }
      }

      if (this.images[nearest]) {
        this.drawImage(this.images[nearest]);
      }
      return;
    }

    this.drawImage(img);
  }

  drawImage(img) {
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;
    const imgRatio = img.width / img.height;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (this.isMobile) {
      // On mobile: mimic video behavior (width = 100vw, height = auto, then scale)
      // Start with width = viewport width
      drawWidth = canvasWidth;
      drawHeight = drawWidth / imgRatio;

      // Apply scale
      drawWidth *= CONFIG.mobileViewScale;
      drawHeight *= CONFIG.mobileViewScale;

      // Center, then apply horizontal offset
      offsetX =
        (canvasWidth - drawWidth) / 2 +
        (canvasWidth * CONFIG.mobileViewOffsetX) / 100;
      offsetY = (canvasHeight - drawHeight) / 2;
    } else {
      // On desktop: cover behavior (fill viewport while maintaining aspect ratio)
      const canvasRatio = canvasWidth / canvasHeight;

      if (imgRatio > canvasRatio) {
        drawHeight = canvasHeight;
        drawWidth = drawHeight * imgRatio;
        offsetX = (canvasWidth - drawWidth) / 2;
        offsetY = 0;
      } else {
        drawWidth = canvasWidth;
        drawHeight = drawWidth / imgRatio;
        offsetX = 0;
        offsetY = (canvasHeight - drawHeight) / 2;
      }
    }

    this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    this.ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }
}

// load player when dom is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new ImgPlayer();
    initEmailSignup();
  });
} else {
  new ImgPlayer();
  initEmailSignup();
}

// Email Signup Modal Handler
function initEmailSignup() {
  const modal = document.getElementById("signup-modal");
  const trigger = document.getElementById("signup-trigger");
  const closeBtn = document.getElementById("modal-close");
  const form = document.getElementById("signup-form");
  const emailInput = document.getElementById("email-input");
  const submitBtn = document.getElementById("submit-btn");
  const errorMessage = document.getElementById("error-message");
  const modalForm = document.getElementById("modal-form");
  const modalSuccess = document.getElementById("modal-success");

  // Open modal
  trigger.addEventListener("click", () => {
    modal.style.display = "flex";
    emailInput.value = "";
    errorMessage.style.display = "none";
    modalForm.style.display = "block";
    modalSuccess.style.display = "none";
  });

  // Close modal
  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  // Handle form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    if (!email) return;

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = "SUBMITTING...";
    errorMessage.style.display = "none";

    try {
      const response = await fetch(
        `https://a.klaviyo.com/client/subscriptions/?company_id=${CONFIG.klaviyo.companyId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            revision: "2024-07-15",
          },
          body: JSON.stringify({
            data: {
              type: "subscription",
              attributes: {
                profile: {
                  data: {
                    type: "profile",
                    attributes: {
                      email: email,
                    },
                  },
                },
              },
              relationships: {
                list: {
                  data: {
                    type: "list",
                    id: CONFIG.klaviyo.listId,
                  },
                },
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.errors?.[0]?.detail || "Subscription failed");
      }

      // Show success message
      modalForm.style.display = "none";
      modalSuccess.style.display = "block";

      // Close modal after 2 seconds
      setTimeout(() => {
        modal.style.display = "none";
      }, 2000);
    } catch (error) {
      errorMessage.textContent =
        error.message || "Something went wrong. Please try again.";
      errorMessage.style.display = "block";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Subscribe";
    }
  });
}

// Countdown Timer
function initCountdown() {
  const countdownElement = document.getElementById("countdown-timer");
  if (!countdownElement || !CONFIG.countdown || !CONFIG.countdown.targetDate) {
    return;
  }

  function updateCountdown() {
    const targetDate = new Date(CONFIG.countdown.targetDate);
    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
      countdownElement.textContent = "VOICES OF FIRE";
      return;
    }

    // Calculate time units
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    // Format date parts
    const daysOfWeek = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ];
    const months = [
      "JANUARY",
      "FEBRUARY",
      "MARCH",
      "APRIL",
      "MAY",
      "JUNE",
      "JULY",
      "AUGUST",
      "SEPTEMBER",
      "OCTOBER",
      "NOVEMBER",
      "DECEMBER",
    ];

    const dayOfWeek = daysOfWeek[targetDate.getDay()];
    const month = months[targetDate.getMonth()];
    const date = targetDate.getDate();

    // Format time with leading zeros
    const pad = (num) => String(num).padStart(2, "0");

    // Format with cycling centiseconds animation
    const baseText = `${dayOfWeek} ${month} ${date} — ${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    countdownElement.innerHTML = `${baseText}:<span class="countdown-ms"></span>`;
  }

  // Update only once per second - centiseconds animated via CSS
  updateCountdown();
  setInterval(updateCountdown, 1000);
}

// Initialize countdown when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCountdown);
} else {
  initCountdown();
}
