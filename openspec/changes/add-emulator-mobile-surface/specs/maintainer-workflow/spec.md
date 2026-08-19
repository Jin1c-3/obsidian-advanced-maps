## MODIFIED Requirements

### Requirement: Mobile-visible behavior is verified on a mobile surface

A change that alters what a reader sees or touches on a phone SHALL be verified beyond the desktop pane before it ships, and its pull request SHALL record what was verified and where.

Maintainer documentation SHALL state what each surface can answer. Obsidian's own mobile emulation is the first pass: it resizes the viewport and switches the platform flags a plugin reads, so it reaches mobile-only registrations and touch-sized layout. It draws none of the mobile application's own chrome and runs none of the Android web view. An emulator running the released mobile application is the second: it draws that chrome and runs that web view, so a claim about whether a control sits under an application toolbar, what a resource URL resolves to, or how a permission prompt behaves — including a refusal — SHALL be settled on an emulator or a device, and SHALL NOT be recorded as verified from desktop emulation alone.

An emulator renders in software and runs on host memory. A claim about a phone's graphics or decoded-image budgets, or about whether the result is fast enough to use, SHALL be settled on a device, and a timing or frame rate observed on an emulator SHALL NOT be recorded as verified.

Maintainer documentation SHALL also state how a build reaches each of those surfaces and how each one's console is read, so the emulator pass and the device pass are procedures rather than exercises for the reader.

#### Scenario: A change moves something a reader touches on a phone

- **WHEN** a change alters a control, a readout, or a layout that appears on a map
- **THEN** it is exercised under mobile emulation, and its pull request says so

#### Scenario: The claim is one emulation cannot settle

- **WHEN** the change's claim concerns the mobile application's own chrome, a resource URL, or a permission prompt — none of which Obsidian's desktop mobile emulation draws or runs
- **THEN** it is settled on an emulator or a device, and a desktop-emulation-only check is not recorded as having verified it

#### Scenario: The claim needs real hardware

- **WHEN** the change's claim concerns a device's graphics or decoded-image budget, or whether the result is fast enough to use
- **THEN** it is settled on a device, and a measurement taken on an emulator's software renderer is not recorded as having verified it

#### Scenario: A maintainer needs the emulator path

- **WHEN** a maintainer has a build and no phone at hand
- **THEN** the contributor documentation names how the released mobile application and a vault reach an emulator, and how that emulator's web view console is read

#### Scenario: A maintainer needs the device path

- **WHEN** a maintainer has a build and a phone
- **THEN** the contributor documentation names how the built plugin reaches a vault on that device and how its console is read
