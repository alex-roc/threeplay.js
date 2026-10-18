import type { ImageMetadata } from "astro";
import fpsMaze from "../assets/thumbs/fps-maze.png";
import hello from "../assets/thumbs/hello.png";
import physicsSandbox from "../assets/thumbs/physics-sandbox.png";
import platformer3d from "../assets/thumbs/platformer-3d.png";
import pluginExample from "../assets/thumbs/plugin-example.png";
import racing from "../assets/thumbs/racing.png";
import thirdPerson from "../assets/thumbs/third-person.png";

export interface Example {
  /** Folder name under `examples/`, also the URL slug. */
  name: string;
  title: string;
  /** One line, shown on cards. */
  description: string;
  genre: string;
  /** Engine features the example shows. */
  features: string[];
  /** How to play, shown next to the game. */
  controls: string[];
  /** A few sentences for the example page. */
  about: string;
  thumb: ImageMetadata;
}

export const examples: Example[] = [
  {
    name: "hello",
    title: "Hello, threeplay",
    description: "The smallest scene: a floor, a falling box and an orbiting camera.",
    genre: "Starter",
    features: ["add([...])", "box()", "area() + body()", "orbitCamera()", "text() HUD"],
    controls: ["Nothing to press: watch the box fall."],
    about:
      "Six lines of game code. Components describe what an object is (a box, a position, a color, a collider, a rigid body) and the engine does the rest: rendering, physics and the camera.",
    thumb: hello,
  },
  {
    name: "platformer-3d",
    title: "Coin run",
    description: "A 3D collectathon: hop between floating platforms and grab every coin.",
    genre: "Platformer",
    features: [
      "character()",
      "thirdPerson()",
      "custom components",
      "onCollide()",
      "scenes",
      "beep()",
    ],
    controls: ["WASD or arrows to move", "Space to jump", "Drag to look around"],
    about:
      "A kinematic character controller with a third-person camera, coins that spin through a tiny custom component, and a win scene. Everything is defined with data: the level is an array of platforms.",
    thumb: platformer3d,
  },
  {
    name: "fps-maze",
    title: "Maze shooter",
    description: "A first-person maze from an ASCII map: find the exit and shoot what moves.",
    genre: "First person",
    features: ["addLevel()", "firstPerson()", "raycast()", "health()", "fog", "camShake()"],
    controls: ["Click to capture the mouse", "WASD to move", "Click to shoot"],
    about:
      "The map is a list of strings: every character becomes a game object. Enemies chase you with character(), shots are raycasts, and the health component fires hurt and death events.",
    thumb: fpsMaze,
  },
  {
    name: "racing",
    title: "Arcade laps",
    description: "Race against the clock around a track described as text.",
    genre: "Racing",
    features: ["addLevel()", "camFollow()", "child objects", "sensors", "custom components"],
    controls: ["Arrows or WASD to drive"],
    about:
      "A car is a custom component: throttle, friction and speed-dependent steering in twenty lines. A chase camera follows its heading, and invisible sensor boxes count checkpoints and laps.",
    thumb: racing,
  },
  {
    name: "physics-sandbox",
    title: "Physics sandbox",
    description: "Knock over a tower, spawn shapes and flick them around.",
    genre: "Toy",
    features: [
      "dynamic bodies",
      "applyImpulse()",
      "onClick() on 3D objects",
      "lifespan()",
      "orbitCamera()",
    ],
    controls: [
      "Click a shape to flick it",
      "Space: spawn shapes",
      "B: bowl the ball",
      "R: reset",
      "Drag to orbit",
    ],
    about:
      "Rapier does the heavy lifting; threeplay gives every object a rigid body with one component. Clicks are raycast against the scene, so onClick works on 3D objects like it does on sprites in kaplay.",
    thumb: physicsSandbox,
  },
  {
    name: "third-person",
    title: "Guard patrol",
    description: "Explore a field, kick crates and stay out of the guard's sight.",
    genre: "Adventure",
    features: ["state()", "thirdPerson()", "custom buttons", "gamepad", "child objects", "timers"],
    controls: [
      "WASD to move",
      "Space to jump",
      "E or click to kick crates",
      "Drag to look",
      "Gamepad works too",
    ],
    about:
      "The guard is a small state machine (patrol, chase, rest) written with state(). Buttons are named actions mapped to keyboard, mouse and gamepad, so one handler serves every device.",
    thumb: thirdPerson,
  },
  {
    name: "plugin-example",
    title: "Write a plugin",
    description: "Extend the engine with your own components and functions.",
    genre: "Extending",
    features: [
      "definePlugin()",
      "plugin dependencies",
      "custom components",
      "global mode",
      "onClick()",
    ],
    controls: ["Click a sphere to celebrate"],
    about:
      "threeplay is a small core plus plugins, and your plugins are written against the same API as the built-in ones. This one adds a bob() component and a confetti() function that appear as globals.",
    thumb: pluginExample,
  },
];

export function getExample(name: string): Example {
  const found = examples.find((e) => e.name === name);
  if (!found) throw new Error(`Unknown example "${name}"`);
  return found;
}

/** Full source of every example's `main.js`, read at build time. */
const sources = import.meta.glob("../../../examples/*/main.js", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function exampleSource(name: string): string {
  const src = sources[`../../../examples/${name}/main.js`];
  if (src === undefined) throw new Error(`examples/${name}/main.js not found`);
  return src;
}

export const REPO_URL = "https://github.com/alex-roc/threeplay.js";
export const repoFile = (path: string) => `${REPO_URL}/blob/main/${path}`;
