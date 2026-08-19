## 1. Contributor documentation

- [x] 1.1 Reword the opener of `CONTRIBUTING.md` → `Testing on mobile` so it no longer says the work takes exactly two passes
- [x] 1.2 Add the emulator section between the emulation and device passes: cmdline-tools install, AVD creation, launch command, and sideloading the released APK from the same releases page as the desktop builds
- [x] 1.3 Record the two setup facts a first attempt gets wrong: take a `google_apis` image rather than `google_apis_playstore`, and grant the _Device storage_ vault's folder picker once so `adb push` reaches the vault afterwards
- [x] 1.4 State that hardware acceleration is not optional — `/dev/kvm`, and under WSL nested virtualization plus `kvm` group membership — and that the window returns through WSLg
- [x] 1.5 State that rendering is software-backed: WebGL 2 is available and the plugin draws in full, but timings are read off a device only
- [x] 1.6 Name how the emulator's web view console is read (`chrome://inspect`, with a WSL-hosted emulator keeping adb in WSL), matching the device paragraph's existing console guidance
- [x] 1.7 Move the application-toolbar, resource-URL, and permission-prompt claims out of "What only a device settles" and into what the emulator settles
- [x] 1.8 Narrow "What only a device settles" to graphics and decoded-image budgets, plus whether the result is fast enough to use

## 2. Verification

- [x] 2.1 Confirm the amended `Testing on mobile` section answers every clause of the modified requirement: what each of the three surfaces settles, the timing prohibition, and a named path to both the emulator and a device
- [x] 2.2 Run `openspec validate add-emulator-mobile-surface --strict`
- [x] 2.3 Run `npm run check`
- [x] 2.4 Confirm the diff touches only `CONTRIBUTING.md` and this change's artifacts — nothing under `src/`, `tests/`, `docs/guide/`, or `website/`

## 3. Pull request

- [x] 3.1 Branch from an updated `main`, commit, and push
- [x] 3.2 Open the pull request, link this OpenSpec change, and state that no plugin behavior changes
- [ ] 3.3 Wait for `CI / format · lint · types · tests · build` to pass
