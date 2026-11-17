// Keyboard + mouse input. Tracks held keys, edge-triggered presses,
// and mouse drag for the third-person camera orbit.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.dragX = 0;
    this.dragY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.mouseClicked = true;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.mouseDown) return;
      this.dragX += e.movementX || 0;
      this.dragY += e.movementY || 0;
    });
    // Touch: one finger drag orbits the camera.
    canvas.addEventListener('touchstart', () => { this.mouseDown = true; }, { passive: true });
    canvas.addEventListener('touchend', () => { this.mouseDown = false; }, { passive: true });
  }

  down(code) { return this.keys.has(code); }
  // True once, on the frame the key went down.
  hit(code) { return this.pressed.has(code); }
  axis(neg, pos) { return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0); }

  // Consume one-frame state after the game loop reads it.
  endFrame() {
    this.pressed.clear();
    this.dragX = 0;
    this.dragY = 0;
    this.mouseClicked = false;
  }
}
