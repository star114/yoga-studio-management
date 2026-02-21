# Changelog

## [1.3.0](https://github.com/star114/yoga-studio-management/compare/v1.2.0...v1.3.0) (2026-02-21)


### Features

* **admin-customers:** add one-click customer password reset ([de76e9b](https://github.com/star114/yoga-studio-management/commit/de76e9b203e28073e6eeab1df382d214d8e9d9bc))
* **auth:** support login with email or phone identifier ([664afd3](https://github.com/star114/yoga-studio-management/commit/664afd37d3aaf871257637f2832dd65bd0fa0f61))
* **customer:** add profile page and self password change ([1b0b208](https://github.com/star114/yoga-studio-management/commit/1b0b2089721fa4daafa22cc0e4e001b555d7013a))
* **customers:** enforce contact ID rule and default initial password ([275378c](https://github.com/star114/yoga-studio-management/commit/275378cb3c79f6532c02db3d37b2e2d89b293011))


### Bug Fixes

* **auth:** prevent ambiguous phone-based login matches ([45d6957](https://github.com/star114/yoga-studio-management/commit/45d6957c65969bb1828108bb8ef0bc1bbc4ccb0e))
* **lint:** resolve backend test lint violations ([6ccac19](https://github.com/star114/yoga-studio-management/commit/6ccac19ffd4531f7fcc18a8111a2349a3f7f491e))
* **test:** use experimental test-isolation flag for broader node compatibility ([f73deef](https://github.com/star114/yoga-studio-management/commit/f73deef4278de6dea04f131179450e4e1512393c))

## [1.2.0](https://github.com/star114/yoga-studio-management/compare/v1.1.0...v1.2.0) (2026-02-21)


### Features

* **backend:** auto-run DB migrations on startup ([0a098e9](https://github.com/star114/yoga-studio-management/commit/0a098e923f4e40dab29abe7436a27d4e7bc44c4a))
* **classes:** add auto-close worker and runtime class status ([b6e741c](https://github.com/star114/yoga-studio-management/commit/b6e741c47246ebdc5e35c1f2e87980f2826ee05c))
* **classes:** add class detail page and registration comments ([e73157a](https://github.com/star114/yoga-studio-management/commit/e73157a819d84767c8d9760fb0ed899dc756544a))
* customer detail membership flow, calendar improvements, and class auto-close worker ([7990fbc](https://github.com/star114/yoga-studio-management/commit/7990fbcbf94adc36de6bc15f6965bf70cae3a041))
* **customers:** move membership issuance to customer detail page ([ac3ea67](https://github.com/star114/yoga-studio-management/commit/ac3ea67925f5189b1e81b967088639dc3a9a28d2))
* **membership:** enforce integer-only price and payment amount ([0bd2671](https://github.com/star114/yoga-studio-management/commit/0bd2671b476cbc6c08b2543a3e061e61ef16465d))


### Bug Fixes

* **backend:** ignore empty attendance filter query params ([294ef9e](https://github.com/star114/yoga-studio-management/commit/294ef9e79747bea8520baec0506d6257d302f95f))
* **calendar:** resolve class date timezone drift and display mismatch ([ffcdb6a](https://github.com/star114/yoga-studio-management/commit/ffcdb6a54b859d3f05e79896946646d8fa470070))
* **frontend:** sync lockfile with yaml@2.8.2 ([48d7c08](https://github.com/star114/yoga-studio-management/commit/48d7c08716f2efe1a16572337128056bbe0dbd19))
* **review:** graceful shutdown and remove duplicate migration run ([7ec6adf](https://github.com/star114/yoga-studio-management/commit/7ec6adf24546fd913ec87a131382f4cb2d32546a))

## [1.1.0](https://github.com/star114/yoga-studio-management/compare/yoga-studio-management-v1.0.0...yoga-studio-management-v1.1.0) (2026-02-21)


### Features

* **backend:** auto-run DB migrations on startup ([0a098e9](https://github.com/star114/yoga-studio-management/commit/0a098e923f4e40dab29abe7436a27d4e7bc44c4a))
* **classes:** add auto-close worker and runtime class status ([b6e741c](https://github.com/star114/yoga-studio-management/commit/b6e741c47246ebdc5e35c1f2e87980f2826ee05c))
* **classes:** add class detail page and registration comments ([e73157a](https://github.com/star114/yoga-studio-management/commit/e73157a819d84767c8d9760fb0ed899dc756544a))
* customer detail membership flow, calendar improvements, and class auto-close worker ([7990fbc](https://github.com/star114/yoga-studio-management/commit/7990fbcbf94adc36de6bc15f6965bf70cae3a041))
* **customers:** move membership issuance to customer detail page ([ac3ea67](https://github.com/star114/yoga-studio-management/commit/ac3ea67925f5189b1e81b967088639dc3a9a28d2))
* **membership:** enforce integer-only price and payment amount ([0bd2671](https://github.com/star114/yoga-studio-management/commit/0bd2671b476cbc6c08b2543a3e061e61ef16465d))


### Bug Fixes

* **backend:** ignore empty attendance filter query params ([294ef9e](https://github.com/star114/yoga-studio-management/commit/294ef9e79747bea8520baec0506d6257d302f95f))
* **calendar:** resolve class date timezone drift and display mismatch ([ffcdb6a](https://github.com/star114/yoga-studio-management/commit/ffcdb6a54b859d3f05e79896946646d8fa470070))
* **frontend:** sync lockfile with yaml@2.8.2 ([48d7c08](https://github.com/star114/yoga-studio-management/commit/48d7c08716f2efe1a16572337128056bbe0dbd19))
* **review:** graceful shutdown and remove duplicate migration run ([7ec6adf](https://github.com/star114/yoga-studio-management/commit/7ec6adf24546fd913ec87a131382f4cb2d32546a))

## Changelog

All notable changes to this project will be documented in this file.

This file is automatically managed by Release Please.
