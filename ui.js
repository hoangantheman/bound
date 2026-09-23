let cameraWindow;
let cameraHeader;
let collapseButton;

let controlsWindow;
let controlsHeader;
let controlsCollapseButton;

let draggingWindow = null;

let dragging = false;

let offsetX = 0;
let offsetY = 0;


// ==================================================
// TUTORIAL
// ==================================================

let tutorialPage = 0;
let selectedHandedness = null;

function setupStartScreen() {

  let startScreen =
    document.getElementById("start-screen");

  if (!startScreen) {
    return;
  }

  startScreen.addEventListener(
    "click",
    async function() {

      startScreen.classList.add("is-hidden");

      await startExperience();

      openTutorial();

    },
    {
      once: true
    }
  );
}


function openTutorial() {

  let tutorial =
    document.getElementById("tutorial");

  if (!tutorial) {
    return;
  }

  tutorial.classList.add("is-visible");
  tutorial.setAttribute("aria-hidden", "false");

  renderTutorial();
}


function closeTutorial() {

  let tutorial =
    document.getElementById("tutorial");

  if (!tutorial) {
    return;
  }

  tutorial.classList.remove("is-visible");
  tutorial.setAttribute("aria-hidden", "true");

  updateControlsWindow();
}


function renderTutorial() {

  let content =
    document.getElementById("tutorial-content");

  let nextButton =
    document.getElementById("tutorial-next");

  let backButton =
    document.getElementById("tutorial-back");

  let progress =
    document.getElementById("tutorial-progress");

  if (!content) {
    return;
  }

  backButton.disabled =
    tutorialPage === 0;

  nextButton.textContent =
    "→";

  nextButton.disabled =
    tutorialPage === 1 && !selectedHandedness;

  let dots = "";

  for (let i = 0; i < 3; i++) {

    dots +=
      `<span class="tutorial-dot ${
        i === tutorialPage
          ? "is-active"
          : ""
      }"></span>`;

  }

  progress.innerHTML = dots;


  if (tutorialPage === 0) {

    content.innerHTML = `
      <h2>Welcome to Bound!</h2>
      <p>
        This is an interactive drawing site where we use your camera to track your hands. To ensure a smooth experience, turn on your camera.
      </p>
    `;

    return;
  }


  if (tutorialPage === 1) {

    content.innerHTML = `
      <h2>Accessibility</h2>
      <p>Are you left-handed or right-handed?</p>

      <div class="tutorial-choice">
        <button
          type="button"
          data-handedness="left"
          class="${selectedHandedness === "left" ? "is-selected" : ""}"
        >
          LEFT-HANDED
        </button>

        <button
          type="button"
          data-handedness="right"
          class="${selectedHandedness === "right" ? "is-selected" : ""}"
        >
          RIGHT-HANDED
        </button>
      </div>
    `;

    content
      .querySelectorAll("[data-handedness]")
      .forEach(function(button) {

        button.addEventListener(
          "click",
          function() {

            selectedHandedness =
              button.dataset.handedness;

            setHandedness(
              selectedHandedness
            );

            renderTutorial();

          }
        );

      });

    return;
  }


  let colourSide =
    selectedHandedness === "left"
      ? "Right"
      : "Left";

  let drawingSide =
    selectedHandedness === "left"
      ? "Left"
      : "Right";

  let colourBox = `
    <div class="tutorial-control">
      <h3>${colourSide}:</h3>

      <p>
        - Pinch your thumb with different fingers to change the color of the drawing stroke.
      </p>

      <p>
        - Hover your ${colourSide.toLowerCase()} hand around to feel your drawing.
      </p>
    </div>
  `;

  let drawingBox = `
    <div class="tutorial-control">
      <h3>${drawingSide}:</h3>

      <p>
        - Pinch your thumb with your index finger to draw.
      </p>

      <p>
        - Pinch your thumb with your middle finger to undo.
      </p>

      <p>
        - Pinch your thumb with your pinky to clear the canvas.
      </p>
    </div>
  `;

  let controls =
    selectedHandedness === "left"
      ? drawingBox + colourBox
      : colourBox + drawingBox;

  content.innerHTML = `
    <h2>Controls</h2>

    <div class="tutorial-controls">
      ${controls}
    </div>

    <p class="tutorial-camera-note">
      Make sure your hands stay within your camera!
    </p>
  `;
}


function setupTutorialNavigation() {

  let nextButton =
    document.getElementById("tutorial-next");

  let backButton =
    document.getElementById("tutorial-back");

  if (!nextButton || !backButton) {
    return;
  }

  nextButton.addEventListener(
    "click",
    function() {

      if (tutorialPage < 2) {

        if (tutorialPage === 1) {

          if (!selectedHandedness) {
            return;
          }

          setHandedness(
            selectedHandedness
          );

        }

        tutorialPage++;

        renderTutorial();

      } else {

        closeTutorial();

      }

    }
  );


  backButton.addEventListener(
    "click",
    function() {

      if (tutorialPage > 0) {

        tutorialPage--;

        renderTutorial();

      }

    }
  );
}


// ==================================================
// CAMERA WINDOW
// ==================================================

function setupCameraWindow() {

  cameraWindow =
    document.getElementById("camera-window");

  cameraHeader =
    document.getElementById("camera-header");

  collapseButton =
    document.getElementById("collapse-button");


  if (!cameraWindow) {
    return;
  }


  cameraHeader.addEventListener(
    "mousedown",
    startDragging
  );


  document.addEventListener(
    "mousemove",
    dragWindow
  );


  document.addEventListener(
    "mouseup",
    stopDragging
  );


  collapseButton.addEventListener(
    "click",
    function(event) {

      event.stopPropagation();

      cameraWindow.classList.toggle(
        "collapsed"
      );


      if (
        cameraWindow.classList.contains(
          "collapsed"
        )
      ) {

        collapseButton.innerHTML = "+";

      } else {

        collapseButton.innerHTML = "—";

      }

    }
  );

}


// ==================================================
// VOLUME
// ==================================================

function setupVolumeControl() {

  let volumeSlider =
    document.getElementById("music-volume");


  if (!volumeSlider) {
    return;
  }


  volumeSlider.addEventListener(
    "input",
    function() {

      musicVolume =
        Number(volumeSlider.value);


      if (audioFile) {
        audioFile.volume =
          musicVolume;
      }

    }
  );

}


// ==================================================
// WINDOW DRAGGING
// ==================================================

function startDragging(event) {

  if (
    event.target === collapseButton ||
    event.target === controlsCollapseButton
  ) {
    return;
  }

  draggingWindow =
    event.currentTarget === cameraHeader
      ? cameraWindow
      : controlsWindow;

  dragging = true;

  let rect =
    draggingWindow.getBoundingClientRect();

  offsetX =
    event.clientX -
    rect.left;

  offsetY =
    event.clientY -
    rect.top;
}


function dragWindow(event) {

  if (!dragging || !draggingWindow) {
    return;
  }

  draggingWindow.style.left =
    event.clientX -
    offsetX +
    "px";

  draggingWindow.style.top =
    event.clientY -
    offsetY +
    "px";
}


function stopDragging() {

  dragging = false;
  draggingWindow = null;
}


// ==================================================
// CONTROLS WINDOW
// ==================================================

function setupControlsWindow() {

  controlsWindow =
    document.getElementById("controls-window");

  controlsHeader =
    document.getElementById("controls-header");

  controlsCollapseButton =
    document.getElementById("controls-collapse-button");

  if (!controlsWindow || !controlsHeader || !controlsCollapseButton) {
    return;
  }

  controlsHeader.addEventListener(
    "mousedown",
    startDragging
  );

  controlsCollapseButton.addEventListener(
    "click",
    function(event) {

      event.stopPropagation();

      controlsWindow.classList.toggle(
        "collapsed"
      );

      controlsCollapseButton.innerHTML =
        controlsWindow.classList.contains("collapsed")
          ? "+"
          : "—";
    }
  );

  updateControlsWindow();
}


function updateControlsWindow() {

  let content =
    document.getElementById("controls-content");

  if (!content || !selectedHandedness) {
    return;
  }

  let colourSide =
    selectedHandedness === "left"
      ? "Right"
      : "Left";

  let drawingSide =
    selectedHandedness === "left"
      ? "Left"
      : "Right";

  let colourBox = `
    <div class="controls-section">
      <h3>${colourSide}:</h3>
      <p>- Pinch your thumb with different fingers to change the color of the drawing stroke.</p>
      <p>- Hover your ${colourSide.toLowerCase()} hand around to feel your drawing.</p>
    </div>
  `;

  let drawingBox = `
    <div class="controls-section">
      <h3>${drawingSide}:</h3>
      <p>- Pinch your thumb with your index finger to draw.</p>
      <p>- Pinch your thumb with your middle finger to undo.</p>
      <p>- Pinch your thumb with your pinky to clear the canvas.</p>
    </div>
  `;

  content.innerHTML = `
    ${
      selectedHandedness === "left"
        ? drawingBox + colourBox
        : colourBox + drawingBox
    }
    <p class="controls-camera-note">Make sure your hands stay within your camera!</p>
  `;
}


// ==================================================
// START UI
// ==================================================

setupStartScreen();
setupTutorialNavigation();
setupCameraWindow();
setupControlsWindow();
setupVolumeControl();
