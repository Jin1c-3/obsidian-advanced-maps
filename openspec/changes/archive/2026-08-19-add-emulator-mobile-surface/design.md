## Context

See proposal.md — Why. The requirement being amended draws its boundary from a claim about capability, not convenience: the device clause exists because desktop emulation runs none of the Android web view. That premise is still true. What changed is that a third surface now sits between them, so the boundary has to be redrawn from what each surface actually runs rather than from how many surfaces there happen to be.

The redrawing rests on one measurement session (2026-08-19, an Android 16 `google_apis` x86_64 image under WSL2 with KVM). What it showed:

- The released APK is a universal build carrying `lib/x86_64/`, so an x86_64 image runs it without translation. There is no separate mobile build to keep in step.
- The guest reports `OpenGL ES 3.0 (SwiftShader)`. That is enough for WebGL 2, and the whole plugin drew — marker icons and colors, track geometry with direction arrows, photo-thumbnail markers, the measure control.
- The host has no `/dev/dri` and reports `llvmpipe`, so the software path is not a configuration choice that a better host could avoid.
- `webview_devtools_remote_*` sockets are present, so the web view console is read exactly as a phone's is.

## Goals / Non-Goals

**Goals:**

- Assign each claim in the requirement to the least expensive surface that genuinely settles it.
- Keep the device clause honest by naming what makes it device-only — software rendering and host memory — rather than listing symptoms.
- Give the emulator pass the same standing the device pass already has: a named procedure in contributor documentation.

**Non-Goals:**

- Automating the emulator, or adding it to CI. Nothing here runs unattended.
- Prescribing an Android version, device profile, or provisioning tool. The requirement names what documentation must answer, not which tool answers it.
- Relaxing the rule that a pull request records what was verified and where. The set of surfaces grows; the recording duty does not change.

## Decisions

**Split the old device clause by mechanism, not by enumeration.** The clause bundled four claims because one surface answered all four. Three of them — application chrome, resource-URL resolution, permission prompts — are properties of the mobile application and its web view, and an emulator runs both. The fourth is a property of the hardware. Writing the split as two sentences with stated causes ("draws that chrome and runs that web view" / "renders in software and runs on host memory") means a future surface can be placed against the requirement without amending it again. The alternative, keeping one clause and adding "or an emulator" to it, would have left graphics budgets sitting in a sentence whose premise no longer held.

**State the timing prohibition as its own normative sentence.** Software rendering does not merely make the emulator slow; it makes any number read off it meaningless as a claim about a phone, while still looking like a measurement. That is a failure mode worth a SHALL of its own rather than a parenthetical, because the tempting mistake is recording a frame rate that was easy to obtain.

**Amend the requirement rather than adding a second one.** Two requirements covering the same question would have to be read together to know what is device-only, and the second could drift out of agreement with the first. The delta uses MODIFIED with the whole block restated, which is also what keeps the archive step from losing scenarios.

**Keep `CONTRIBUTING.md` as the only procedural home.** The spec says documentation must name how a build and a vault reach each surface; it does not carry the commands. This preserves the existing division — observable contract in the spec, setup and workflow in contributor documentation — and keeps machine-specific paths out of the specification entirely.

## Risks / Trade-offs

- **A maintainer reads "emulator settles it" as "a phone is never needed".** → The device scenario stays, and the timing prohibition is written as a prohibition rather than as advice, so the one thing an emulator must not be used for is stated in the same requirement.
- **The emulator conclusions rest on a single session on one host.** → The three claims moved are properties of the Android web view and the mobile application, which is what the emulator runs by construction; only the rendering observation is host-specific, and it is used to _restrict_ the emulator's authority, so a stronger host would not invalidate the requirement.
- **Setup instructions in `CONTRIBUTING.md` age faster than the spec.** → The version-bearing details live in the command block, which is replaceable without touching the requirement, and the spec asks for named answers rather than for specific tools.
- **The verification bar rises for changes that previously stopped at desktop emulation.** → It rises only for claims that desktop emulation never settled; those changes were already supposed to reach a device, and the emulator makes the cheaper path available rather than adding a step.
