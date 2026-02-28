# Changelog

## [2.2.0](https://github.com/star114/yoga-studio-management/compare/v2.1.0...v2.2.0) (2026-02-28)


### Features

* admin account management hardening and UX improvements ([b90a335](https://github.com/star114/yoga-studio-management/commit/b90a335c1e8529d3ad9cffd5c7c87c82f42a5102))


### Bug Fixes

* improve admin account navigation and password reset UX ([3092404](https://github.com/star114/yoga-studio-management/commit/30924049e72eb8d612522da561dca1ac704c9c64))

## [2.1.0](https://github.com/star114/yoga-studio-management/compare/v2.0.1...v2.1.0) (2026-02-28)


### Features

* add admin account management interface ([cb3fb79](https://github.com/star114/yoga-studio-management/commit/cb3fb79a203367f3957dcc77d5f7cb0e4ab64683))
* add admin account management interface ([89aa424](https://github.com/star114/yoga-studio-management/commit/89aa4249420f269f6beea648f57264dcf76837de))


### Bug Fixes

* handle referenced admin delete conflicts ([771099b](https://github.com/star114/yoga-studio-management/commit/771099b23f9847e84e91826d8aace0031179807a))
* make admin deletion guard atomic ([662c162](https://github.com/star114/yoga-studio-management/commit/662c16235e720d6a8ff4b0b4e6b097776c4b1523))
* revoke deleted admin access immediately ([51db7a3](https://github.com/star114/yoga-studio-management/commit/51db7a3a54435c824c665bb11aa94ad6bc592f01))
* validate admin password reset target id ([6800d27](https://github.com/star114/yoga-studio-management/commit/6800d27ea3036a7465e2af8123dd841e84650400))

## [2.0.1](https://github.com/star114/yoga-studio-management/compare/v2.0.0...v2.0.1) (2026-02-28)


### Bug Fixes

* add explicit DB name to pg_isready checks ([850bcd2](https://github.com/star114/yoga-studio-management/commit/850bcd29386747543db1c0171d37094ba0e58c30))
* add explicit DB name to pg_isready checks ([9a5bd13](https://github.com/star114/yoga-studio-management/commit/9a5bd13df50b3ff5f69643887b1a7d502d89d98b))

## [2.0.0](https://github.com/star114/yoga-studio-management/compare/v1.6.0...v2.0.0) (2026-02-28)


### ⚠ BREAKING CHANGES

* release bootstrap marker commit to force initial major version bump.

### Features

* bootstrap initial major release versioning ([f12ef75](https://github.com/star114/yoga-studio-management/commit/f12ef75f6670dc2033248ba47482795cefdd7676))

## [1.6.0](https://github.com/star114/yoga-studio-management/compare/v1.5.0...v1.6.0) (2026-02-27)


### Features

* add attendance comment thread backend endpoints ([01b7443](https://github.com/star114/yoga-studio-management/commit/01b7443d51b03e575e45abeaeeaa0ff5cb43a100))
* add attendance comment thread end-to-end ([4b63b65](https://github.com/star114/yoga-studio-management/commit/4b63b658ef97ba7ef4c2a871f7dfc4b49dde4b90))
* add attendance comment thread schema migrations ([7fc295d](https://github.com/star114/yoga-studio-management/commit/7fc295d01c18410fd86115bf889812523f026a41))
* add comment thread UI for customer and admin views ([a8e7ab3](https://github.com/star114/yoga-studio-management/commit/a8e7ab3c57aced4f6a68b4aade3842e0c03b0d1a))
* show full post-class comment thread in dashboard cards ([4b79af2](https://github.com/star114/yoga-studio-management/commit/4b79af2133efcfcc43ebc8c35dff1f6b092e01bb))

## [1.5.0](https://github.com/star114/yoga-studio-management/compare/v1.4.0...v1.5.0) (2026-02-27)


### Features

* add attendance customer comment schema and migration ([a5594dd](https://github.com/star114/yoga-studio-management/commit/a5594dded396c98703d3037d65ebf5e3b25b54fa))
* add customer attendance comment api and admin visibility ([da2dede](https://github.com/star114/yoga-studio-management/commit/da2dede3dceb1e323ffaf31c5a811f7b40f40c6e))
* add customer attendance comment flow ([80b3a5f](https://github.com/star114/yoga-studio-management/commit/80b3a5f05561f15c02b281b8774a53be6064d51c))
* add customer attendance comment ui for class detail ([ea86170](https://github.com/star114/yoga-studio-management/commit/ea86170a97d09ec7a58a5461a1380ce34a75cc3b))


### Bug Fixes

* guard stale customer attendance comment save by class id ([0a45764](https://github.com/star114/yoga-studio-management/commit/0a45764e07b1b0ea1b49e5c4308412f6dacf8c74))
* ignore stale attendance-comment save errors after route change ([773a39a](https://github.com/star114/yoga-studio-management/commit/773a39a9b2a5f7e01d805efb37e2ae6daf78fbfc))

## [1.4.0](https://github.com/star114/yoga-studio-management/compare/v1.3.0...v1.4.0) (2026-02-24)


### Features

* add class history page and default class list window ([601c66a](https://github.com/star114/yoga-studio-management/commit/601c66a3a764439deb8984ff26ecb0976d9b895d))
* align admin tabs center with ios segment style ([0393c5c](https://github.com/star114/yoga-studio-management/commit/0393c5c568f0dc344bfdf070944a445f349262df))
* align attendance status transitions with check-in flow ([198d0eb](https://github.com/star114/yoga-studio-management/commit/198d0ebb3f45435a62aeb6c661ec2096f68c1688))
* align calendar navigation controls to the right ([24f20e1](https://github.com/star114/yoga-studio-management/commit/24f20e14e4a78a4173bdd0d148365f51af853139))
* **attendance:** require class_id and add class-detail check-in action ([8907dc7](https://github.com/star114/yoga-studio-management/commit/8907dc74e6c6e33eeabd7158399a625e86f0380f))
* automate attendance status and allow admin absence override ([9cf8918](https://github.com/star114/yoga-studio-management/commit/9cf891830da6a5b85f5d29c284d08e27ae27f42a))
* **backend:** include attendance metadata in class registrations ([6d8327b](https://github.com/star114/yoga-studio-management/commit/6d8327b27aa612c776a56efcd2b277fcdfd05d04))
* **customer-dashboard:** show class title and schedule in attendance list ([a23d301](https://github.com/star114/yoga-studio-management/commit/a23d3019544e5be3f142b9b4fad9f80bdc39cc34))
* **customer-detail:** show attended classes and instructor comments ([e43879a](https://github.com/star114/yoga-studio-management/commit/e43879aeb5e3c2e64a8f315e4f8c0ff4ff11d51e))
* **db:** add attendance class_id and enforce not-null constraint ([abf1704](https://github.com/star114/yoga-studio-management/commit/abf17045ce0f3c7b3cc1f67a6d12845980ca8e1c))
* **frontend:** add dashboard navigation shortcuts ([e557dcd](https://github.com/star114/yoga-studio-management/commit/e557dcd14ee3fd3bc07655ad9482364e54e56d85))
* **frontend:** refine class detail attendance and instructor comments ([94bcfe6](https://github.com/star114/yoga-studio-management/commit/94bcfe6c488d3e8c41bbd8c75f926f8619920c63))
* improve admin calendar month view for mobile ([5cb0dfb](https://github.com/star114/yoga-studio-management/commit/5cb0dfbbf9086285e81d743377b560599f73bb2d))
* improve customer history view and remove membership payment amount ([03408bf](https://github.com/star114/yoga-studio-management/commit/03408bfab8fd761e9a9eb8a0bd4488d6af1a69b5))
* merge accumulated dev updates ([bb9501d](https://github.com/star114/yoga-studio-management/commit/bb9501d186afa98a9819cfacb72db052cf7eb0bb))
* move class editing from list to class detail page ([a57a7e6](https://github.com/star114/yoga-studio-management/commit/a57a7e6bf9f24b952f214e80ef27103cccb3551f))
* redesign customer tabs and add memberships page ([b50254f](https://github.com/star114/yoga-studio-management/commit/b50254f69dcc279735424f9ed8511b1a9ec09431))
* remove membership period and price fields across app ([cf6f1f3](https://github.com/star114/yoga-studio-management/commit/cf6f1f33160124ae891366981b520c824980e095))
* remove recurring-series exclusion model and create recurring classes on frontend ([de8292a](https://github.com/star114/yoga-studio-management/commit/de8292af17080d1988ba68cf7b2d87aed1d9d517))
* revamp customer practice view and mobile-friendly calendar UX ([b9e3176](https://github.com/star114/yoga-studio-management/commit/b9e31760e81e2f4c7f753f89bfa4e0cbb2ac8dfe))
* show membership start/end dates in customer membership views ([f892932](https://github.com/star114/yoga-studio-management/commit/f892932dfdc68061a37cffb0f971b3ca02fe1e4f))
* split practice records into upcoming and past classes ([9954fa0](https://github.com/star114/yoga-studio-management/commit/9954fa075bce6bcb77376f2ee89bec7580a4f4c9))
* switch auth identifier to login_id and phone-based customer login ([1c0421b](https://github.com/star114/yoga-studio-management/commit/1c0421b2b9e97b62f3fb056bba3368ef13ccb518))
* treat login_id as unified user id across auth and UI ([8dfb8d4](https://github.com/star114/yoga-studio-management/commit/8dfb8d409d24481628d1095a5ecf9e59fc529c1f))


### Bug Fixes

* align attendance class FK with set-null delete behavior ([0ce587b](https://github.com/star114/yoga-studio-management/commit/0ce587b3e6d359331fed6776cce48ca576da5032))
* allow explicit membership active toggle override ([4bfb218](https://github.com/star114/yoga-studio-management/commit/4bfb218b2cbe68d4cd422dcec9d1d253244fc7f2))
* bulk sync auto attendance with membership updates ([35a3c26](https://github.com/star114/yoga-studio-management/commit/35a3c263967691274398cd980cdb84afe96c0f62))
* fail migrate when migrations directory is missing ([e8bf840](https://github.com/star114/yoga-studio-management/commit/e8bf840f3878d2564c274d71c66566ab948ec8fd))
* make registration attendance status migration idempotent ([e93285b](https://github.com/star114/yoga-studio-management/commit/e93285b00cfad2208710871d581a6244dfebd7cd))
* reconcile attendance status and make recurring creation atomic ([ee0452e](https://github.com/star114/yoga-studio-management/commit/ee0452eb3d859f06b6cf39d3f73cf686d93bdd2f))
* reject duplicate attendance check-ins per class customer ([5a0e54b](https://github.com/star114/yoga-studio-management/commit/5a0e54b308a69acd637c6cc5952fb6426731a2a9))
* restore coverage gates for backend and frontend CI ([2a1e8da](https://github.com/star114/yoga-studio-management/commit/2a1e8da1da99884e82769b576d7c747735a056db))
* restore registration status when attendance is deleted ([3952bfa](https://github.com/star114/yoga-studio-management/commit/3952bfa80b6c6d1e602587036359f76f0f5b7cc1))
* route attended status changes through check-in path ([5cfd9ab](https://github.com/star114/yoga-studio-management/commit/5cfd9ab499e7390008186bb5a69b4242fdc01773))
* skip closed classes in auto attendance promotion ([a578ac8](https://github.com/star114/yoga-studio-management/commit/a578ac8fea4e4c9f4aceebfe3cc254cabe51b657))
* sync user login_id when customer phone is updated ([5b5a46c](https://github.com/star114/yoga-studio-management/commit/5b5a46cc4703a6371d2a16963007dcb80bed51dc))

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
