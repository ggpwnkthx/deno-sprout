# Deployment

A built Sprout app is a static `outDir` plus a small Deno program
that runs `sprout serve`. The deploy story is "build once, serve
anywhere a Deno process can run". This guide covers the three
common targets: Deno Deploy, a VPS, and a container.

The build step is the same on every target:

```sh
deno task build
```

This produces a `<outDir>/` directory (default `.sprout/dist/`)
containing the frozen manifest and the content-hashed assets. The
serve step reads only that directory.

## Deno Deploy

Deno Deploy is the easiest target. The full deploy path is:

1. Run `sprout build` in CI. The output is the `.sprout/dist/`
   directory.
2. Commit the `.sprout/dist/sprout.manifest.json` and the
   `.sprout/dist/_sprout/**` files to the repository. (Or build on
   every deploy; either works.)
3. The `serve` task in the generated `deno.jsonc` runs
   `deno run --allow-read --allow-env --allow-net jsr:@sprout/cli serve`,
   which is the exact command Deno Deploy expects.
4. Set the Deno Deploy entrypoint to the `serve` task. The Deno
   Deploy project UI has a field for "Deno serve command" or
   equivalent; paste the command from the `serve` task.
5. Deno Deploy's edge runtime reads the frozen manifest at startup
   and serves the assets with the full ETag / gzip / immutable
   cache contract.

The `@sprout/core` runtime and its companion packages are pure
Deno modules that resolve from JSR; the deploy environment
downloads them on first boot and caches them.

A typical Deno Deploy entrypoint (in `.github/workflows/deploy.yml`
or the Deno Deploy UI):

```sh
deno run --allow-read --allow-env --allow-net jsr:@sprout/cli serve
```

The `root` is the project root (the directory containing
`sprout.config.ts`). Deno Deploy defaults to the project root, so
no `root` flag is needed.

## VPS / bare metal

A VPS or bare-metal host runs the build once and the serve process
forever. The pipeline is:

1. On the build host, run `deno task build` against a clean checkout.
   The output is the `.sprout/dist/` directory.
2. Sync the build output to the serve host. `rsync` is the obvious
   tool:
   ```sh
   rsync -avz --delete .sprout/dist/ my-host:/srv/my-app/.sprout/dist/
   ```
3. On the serve host, run `deno task serve` (or wrap it in a
   systemd unit, a launchd plist, or a process supervisor of your
   choice). The serve process needs `--allow-read` (for the
   manifest and the asset bytes), `--allow-env` (for the
   host/port env config), and `--allow-net` (for the bind).
4. Put a reverse proxy in front for TLS. `nginx` and `caddy` are
   both fine. The reverse proxy should:
   - Listen on 443 (TLS) and forward plain HTTP to the Sprout port
     (default 8000).
   - Pass `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`
     through. (Sprout reads `Host`; the forwarded headers are
     useful for logging and for future `X-Forwarded-*` handling.)
   - Set its own cache-control for the framework asset paths
     (`/@sprout/...`) only if you want to override Sprout's
     `immutable` setting. The default is fine for most projects.
   - Compress non-framework responses if you have a use case for
     it. Sprout's gzip negotiation is for framework assets; the
     reverse proxy's compression is for everything else.

A minimal `systemd` unit:

```ini
[Unit]
Description=Sprout app
After=network.target

[Service]
WorkingDirectory=/srv/my-app
ExecStart=/usr/local/bin/deno run --allow-read --allow-env --allow-net jsr:@sprout/cli serve
Restart=on-failure
User=sprout

[Install]
WantedBy=multi-user.target
```

The build is separate from the serve: a new build is a `git pull`
followed by a `deno task build` and a `systemctl restart sprout`.
The restart is the only way to pick up a new build; there is no
hot-swap of the frozen manifest in the M9 release.

## Container

A container image is a multi-stage build: stage 1 builds the app,
stage 2 ships only the build output. The Dockerfile is short:

```dockerfile
# Stage 1: build
FROM denoland/deno:distroless AS build
WORKDIR /app
# Copy the source, the lockfile, and the config.
COPY deno.jsonc deno.lock ./
COPY sprout.config.ts ./
COPY src/ ./src/
COPY public/ ./public/
# Run the build. The output is /app/.sprout/dist/.
RUN ["deno", "task", "build"]

# Stage 2: serve
FROM denoland/deno:distroless
WORKDIR /app
# Copy just the build output and the config.
COPY --from=build /app/.sprout/dist/ ./.sprout/dist/
COPY deno.jsonc ./
COPY sprout.config.ts ./
# The serve command.
CMD ["deno", "task", "serve"]
```

A few notes:

- The `distroless` base image is small and includes the Deno
  binary. `denoland/deno:alpine` is also a fine choice.
- The build stage needs `--allow-read --allow-write --allow-env`
  on `deno task build`. The `denoland/deno:distroless` image
  trusts the user; pass `--allow-read --allow-write --allow-env` to
  the `RUN` command if you are on a stricter base.
- The serve stage only needs the `.sprout/dist/` directory and the
  `deno.jsonc` (so `deno task serve` can resolve the `jsr:@sprout/cli`
  import). The source files are not in the final image.
- A `docker run -p 8000:8000 my-app` exposes the serve port. Put a
  reverse proxy on the host for TLS, exactly like the VPS setup.

A common pattern is to push the build stage's output to a
container registry and serve from there. The size of the final
image is dominated by the Deno base image (the build output is
typically a few MB).

## What you do NOT need

A Sprout app does not need any of the following at deploy time:

- **A Node.js runtime.** The build output is pure Deno modules.
- **An `npm install` step.** There is no `package.json` in a
  built app's dependencies.
- **A webpack / vite / rollup build step.** The framework's build
  pipeline is the build step; the output is already
  content-hashed and bundle-optimized.
- **A CDN.** The hashed filenames are CDN-cache-friendly out of
  the box. A CDN in front of the serve process is a perf win at
  scale, but it is not required for correctness.
- **A custom server runtime.** Any environment that can run a
  Deno process works.

## Choosing an `outDir`

The `outDir` defaults to `.sprout/dist`. For deployments, you may
want to use a path that is:

- Inside the project (so `rsync` / `docker cp` is straightforward).
- Not committed to source control (add it to `.gitignore`).
- Not served by a sibling static-file server (the build output is
  served by the Deno process, not by the public file directory).

The generated `sprout init` template does not commit `.sprout/dist`
to git. If you choose to commit the build output (the Deno Deploy
workflow does), you can opt in to committing the directory
explicitly.
