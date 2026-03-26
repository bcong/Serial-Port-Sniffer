import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "path";

export default defineConfig({
    main: {
        build: {
            bytecode: true,
        },
        plugins: [externalizeDepsPlugin()],
    },
    preload: {
        build: {
            bytecode: true,
        },
        plugins: [externalizeDepsPlugin()],
    },
    renderer: {
        resolve: {
            alias: {
                "@renderer": resolve("src/renderer/src"),
            },
        },
        plugins: [react()],
    },
});
