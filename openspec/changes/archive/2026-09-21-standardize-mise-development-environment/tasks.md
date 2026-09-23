## 1. Repository Tool Configuration

- [x] 1.1 Reduce the root mise default tools to Node 24 and the supported
      OpenSpec CLI, add npm-delegating setup/development/check/documentation
      tasks, and verify `mise install --dry-run` does not select Android or a
      desktop Obsidian distribution.
- [x] 1.2 Update CI, documentation, and release workflows to Node 24 while
      retaining `package.json`'s `engines.node` at `>=20`; verify every workflow
      selects 24 and package metadata keeps the confirmed compatibility floor.
- [x] 1.3 Add task-scoped Android SDK/Java setup and emulator tasks plus a
      task-scoped Linux/WSL Obsidian desktop launcher; verify task validation,
      task listing, and dry runs expose the expected tools and commands without
      executing a heavyweight download by default.

## 2. Contributor Documentation

- [x] 2.1 Update the getting-started and OpenSpec passages in
      `CONTRIBUTING.md` to recommend mise, retain the manual Node/npm/OpenSpec
      path, and verify every documented command matches a declared task or
      existing npm script.
- [x] 2.2 Update the mobile verification instructions to use the repository
      Android tasks, document the optional Linux/WSL desktop launcher and the
      separately registered Obsidian CLI client, and verify no step modifies a
      contributor's global mise configuration.

## 3. Verification

- [x] 3.1 Run the lightweight default installation/dry-run checks, task
      validation, and representative npm-delegating mise tasks; confirm optional
      task tools remain absent from the default install plan.
- [x] 3.2 Run `npm run check`, inspect the configuration/documentation diff for
      platform-specific assumptions and personal paths, and confirm no runtime
      plugin, package engine floor, or release metadata changed.
