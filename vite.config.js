import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (
    command === "build" &&
    (!env.VITE_FIREBASE_API_KEY ||
      env.VITE_FIREBASE_API_KEY.startsWith("replace-"))
  ) {
    throw new Error(
      "Set VITE_FIREBASE_API_KEY in .env.local or the GitHub Actions secret before building.",
    );
  }
  return {
    plugins: [react()],
    base: "./",
    server: { host: "127.0.0.1" },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ["firebase/app", "firebase/auth", "firebase/database"],
            react: ["react", "react-dom"],
          },
        },
      },
    },
  };
});
