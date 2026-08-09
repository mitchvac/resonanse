# ---- Build stage ----
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
# onnxruntime-node's postinstall tries to download optional CUDA binaries
# from NuGet; the CPU binary is already bundled in the package, so skip the
# download (it fails in restricted build networks and breaks npm ci).
# --ignore-scripts neutralizes ALL postinstalls: esbuild's platform binary
# ships via its optional dep and works without its install script; sharp's
# prebuilds come from @img/* packages; onnxruntime's CPU binary is bundled.
ENV ONNXRUNTIME_NODE_INSTALL=skip
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV ONNXRUNTIME_NODE_INSTALL=skip

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/dist ./dist
# Runtime data files read from <cwd>/api/assets (tesseract language data +
# ONNX face models) — the bundled server expects them next to the repo root.
COPY --from=build /app/api/assets ./api/assets

EXPOSE 3000
CMD ["node", "dist/boot.js"]
