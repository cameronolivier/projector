## [1.0.2](https://github.com/cameronolivier/projector/compare/v1.0.1...v1.0.2) (2025-12-23)


### Bug Fixes

* **ignore:** add TTY detection and error handling ([b31b89d](https://github.com/cameronolivier/projector/commit/b31b89d4bca7e73cd5006829d67ccbf93849ffb1))

## [1.0.1](https://github.com/cameronolivier/projector/compare/v1.0.0...v1.0.1) (2025-12-23)


### Bug Fixes

* **ignore:** disable useIgnoreFiles during scan to prevent hang ([fc629a7](https://github.com/cameronolivier/projector/commit/fc629a7648a3330b6dbdd3bf07d92abae0c03770))
* **ignore:** simplify checkbox choice formatting ([0309770](https://github.com/cameronolivier/projector/commit/03097700f7d39759d22314e173b2dcec20745a28))

# 1.0.0 (2025-12-23)


### Bug Fixes

* ensure spinner stops in ignore command even on error ([19afe4f](https://github.com/cameronolivier/projector/commit/19afe4f00fd3d10a4d366020be2f850c44033482))
* escape space in shell wrapper sentinel pattern ([9b78c76](https://github.com/cameronolivier/projector/commit/9b78c764e39064d3a4fd084f456c0ba5171a06c5))
* use spinner.succeed() for visible output in ignore command ([5b789f6](https://github.com/cameronolivier/projector/commit/5b789f6b6fc500f2746e9e45fc0d2ccb37d38644))
* use this.log() instead of relying on spinner output ([cf95b77](https://github.com/cameronolivier/projector/commit/cf95b77a348be1b564f550caf6f7d084a80bba1c))


### Features

* add --version and -v flags to display version ([2a3aea5](https://github.com/cameronolivier/projector/commit/2a3aea52fbd40e472f4db192a642c668130a986b))
* add comprehensive project ignore list system ([992b105](https://github.com/cameronolivier/projector/commit/992b1054c7f1aa3ff58565836cf10010154d05d5))
* add comprehensive project root detection and configuration management ([e6a8466](https://github.com/cameronolivier/projector/commit/e6a8466b6a1ca431cb029511bff478c1f5200cf0))
* add comprehensive project template system ([c2d8988](https://github.com/cameronolivier/projector/commit/c2d89885943f11b5359c937e4f96ef856bb42b9e))
* add Go workspace and enhanced monorepo detection ([bd1633e](https://github.com/cameronolivier/projector/commit/bd1633e061d9288c92b3c9ba794b24536adb3f0c))
* add husky pre-commit hooks for changeset validation ([8610eee](https://github.com/cameronolivier/projector/commit/8610eee62385d04505afbcfddb4c9ce8178f8bca))
* add interactive init command for configuration setup ([a5e800c](https://github.com/cameronolivier/projector/commit/a5e800caa91c9c0a689fe7969556b139d9456626))
* add interactive project ignore manager with smart pattern generation ([38a501c](https://github.com/cameronolivier/projector/commit/38a501cec7ba691c3b66950f90b876e1c06a54d6))
* add interactive selection planning and task management ([1ea3733](https://github.com/cameronolivier/projector/commit/1ea3733eba190c1fedd6b4653cde8e2a3439cf32))
* add interactive shell wrapper and enhanced project actions ([7fe1b0d](https://github.com/cameronolivier/projector/commit/7fe1b0db323384d9a77fcf070b0dac388fc044dc))
* add jump and open commands with IDE integration and improved project detection ([a154541](https://github.com/cameronolivier/projector/commit/a1545416441248f4dc19ff23c94887abcc9c3d77))
* add Location column to project table ([f3d66fe](https://github.com/cameronolivier/projector/commit/f3d66feac9fa80ba0062eeac4a837d8931184adb))
* add project tagging system and changeset tooling ([5e8db97](https://github.com/cameronolivier/projector/commit/5e8db9791b7816ace569722477557f0506967ba5))
* add release:full script to release and push in one command ([855fa80](https://github.com/cameronolivier/projector/commit/855fa80c7a837115f0c41aed1cde34dab0e1b214))
* enhance shell wrapper with install/remove commands and comprehensive test coverage ([3eb6306](https://github.com/cameronolivier/projector/commit/3eb63065eed3983186471b001cfd947c85f52136))
* **git:** implement advanced git insights integration with commit activity and branch analysis ([244a075](https://github.com/cameronolivier/projector/commit/244a0758e15cd169395c77f2552906100ceafc8f))
* implement complete projects CLI tool with phase tracking ([80ee3aa](https://github.com/cameronolivier/projector/commit/80ee3aa9bfad6c529593bcb1c45a4e3a048cfd91))
* implement Phase 4 enhanced project discovery with comprehensive help documentation ([5764b0e](https://github.com/cameronolivier/projector/commit/5764b0e0c5c26f6a97ebca7f12cd3024f5b9e69e))
* migrate from changesets to semantic-release ([1652ee9](https://github.com/cameronolivier/projector/commit/1652ee95d4df9d191486d587c8dc0634b54c74f0))
* rename command from 'projects' to 'projector' with default behavior ([02b1b81](https://github.com/cameronolivier/projector/commit/02b1b812f1f9f313384a80e8ea6eb1e563e530c6))

# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
