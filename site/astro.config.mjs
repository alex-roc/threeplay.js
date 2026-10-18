import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { createStarlightTypeDocPlugin } from "starlight-typedoc";

const REPO = "https://github.com/alex-roc/threeplay.js";

// The API reference is generated from the TSDoc of the engine's public entry point.
const [starlightTypeDoc, typeDocSidebarGroup] = createStarlightTypeDocPlugin();

export default defineConfig({
  site: "https://alex-roc.github.io",
  base: "/threeplay.js",
  vite: { build: { chunkSizeWarningLimit: 1000 } }, // the playground bundles CodeMirror
  integrations: [
    starlight({
      title: "threeplay",
      description:
        "A tiny, kaplay-style 3D game engine on three.js and Rapier. Components, tags, physics, cameras and a HUD in a single script tag.",
      logo: { src: "./src/assets/logo.svg", alt: "threeplay" },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: REPO }],
      editLink: { baseUrl: `${REPO}/edit/main/site/` },
      customCss: [
        "@fontsource-variable/bricolage-grotesque",
        "@fontsource-variable/jetbrains-mono",
        "./src/styles/starlight.css",
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: ["../packages/threeplay/src/index.ts"],
          tsconfig: "../packages/threeplay/tsconfig.json",
          output: "api",
          sidebar: { label: "API reference", collapsed: true },
          typeDoc: {
            // Group the index by kind (Classes, Functions, Interfaces, Type Aliases, ...).
            groupOrder: ["Functions", "Classes", "Interfaces", "Type Aliases", "Variables", "*"],
            excludePrivate: true,
            excludeInternal: true,
            readme: "none",
            entryFileName: "index",
            // Plugin type files re-export hundreds of declarations (`export type *`).
            skipErrorChecking: true,
            validation: { notExported: false, invalidLink: false },
          },
        }),
      ],
      sidebar: [
        { label: "Start here", items: [{ slug: "getting-started" }] },
        { label: "Guides", items: [{ autogenerate: { directory: "guides" } }] },
        { label: "Examples", link: "/examples/" },
        { label: "Playground", link: "/playground/" },
        typeDocSidebarGroup,
      ],
    }),
  ],
});
