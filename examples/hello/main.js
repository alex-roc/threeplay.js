import threeplay from "threeplay";

threeplay({ renderer: new URLSearchParams(location.search).get("renderer") ?? "auto" });

// A floor, a falling box and a camera that orbits around them.
add([box(10, 0.5, 10), pos(0, -0.25, 0), color("#90be6d"), area(), body({ isStatic: true })]);
add([box(1, 1, 1), pos(0, 5, 0), rotate(20, 30, 0), color("tomato"), area(), body()]);
add([text("Hello, threeplay!", { size: 28 }), pos(24, 24), fixed()]);
orbitCamera({ distance: 9, autoRotate: 15 });
