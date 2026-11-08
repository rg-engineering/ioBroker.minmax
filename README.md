![Logo](admin/minmax.png)
# ioBroker.minmax

![Number of Installations](http://iobroker.live/badges/minmax-installed.svg) ![Number of Installations](http://iobroker.live/badges/minmax-stable.svg)
[![Downloads](https://img.shields.io/npm/dm/iobroker.minmax.svg)](https://www.npmjs.com/package/iobroker.minmax)
[![NPM version](http://img.shields.io/npm/v/iobroker.minmax.svg)](https://www.npmjs.com/package/iobroker.minmax)

[![Known Vulnerabilities](https://snyk.io/test/github/rg-engineering/ioBroker.minmax/badge.svg)](https://snyk.io/test/github/rg-engineering/ioBroker.minmax)
![GitHub Actions](https://github.com/rg-engineering/ioBroker.minmax/workflows/Test%20and%20Release/badge.svg)

[![NPM](https://nodei.co/npm/iobroker.minmax.png?downloads=true)](https://nodei.co/npm/iobroker.minmax/)

![node-lts](https://img.shields.io/node/v-lts/iobroker.minmax?style=flat-square)
![Libraries.io dependency status for latest release](https://img.shields.io/librariesio/release/npm/iobroker.minmax?label=npm%20dependencies&style=flat-square)


![GitHub](https://img.shields.io/github/license/rg-engineering/ioBroker.minmax?style=flat-square)
![GitHub repo size](https://img.shields.io/github/repo-size/rg-engineering/ioBroker.minmax?logo=github&style=flat-square)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/rg-engineering/ioBroker.minmax?logo=github&style=flat-square)
![GitHub last commit](https://img.shields.io/github/last-commit/rg-engineering/ioBroker.minmax?logo=github&style=flat-square)
![GitHub issues](https://img.shields.io/github/issues/rg-engineering/ioBroker.minmax?logo=github&style=flat-square)

**This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers.** 
For more details and for information how to disable the error reporting see [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)! Sentry reporting is used starting with js-controller 3.0.


**If you like it, please consider a donation:**
                                                                          
[![paypal](https://www.paypalobjects.com/en_US/DK/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/donate/?hosted_button_id=34ESBMJ932QZC) 

## Description
This adapter tracks the minimum and maximum values of selected numeric states for the current day, month, and year. Statistics are updated when a state changes and refreshed at calendar boundaries, even if the source value has not changed. The current source value initializes the statistics for a new period. Optionally, the adapter also calculates the difference between minimum and maximum for each period.

## Settings
Enable min/max tracking for each required state in the object view. You can optionally set a name for its output states and enable calculation of the daily, monthly, and yearly differences. Each output name must be unique within the adapter instance. Only states whose object type is `number` are tracked; non-numeric runtime values are ignored.

Configure the timezone in the adapter settings. It determines the day, month, and year boundaries as well as the displayed times and dates. The default timezone is `Europe/Berlin`.

The adapter requires Node.js 22 or newer.

### Upgrade to version 2.x
On the first start after upgrading to 2.x, the adapter attempts to migrate the old `minmax.json` configuration into the per-state settings visible in the object view (`common.custom`). Existing visible settings take precedence; missing settings can be filled from the legacy file. After a migration attempt has been completed, `minmax.json` is deleted and is no longer needed.

The legacy file does not identify which adapter instance owns its entries. If entries cannot be assigned safely, for example when multiple minmax instances are configured, the adapter logs a warning and discards those entries. Carefully check the enabled states and their settings in the object view after the upgrade. If the file cannot be read or parsed, or the migration cannot be saved, it is retained so the adapter can retry on a later start.

## Changelog
<!--
  Placeholder for the next version (at the beginning of the line):
  ### **WORK IN PROGRESS**
-->
### 2.0.0 (2026-11-08)
* (René) redesign based on typescript

### 1.2.16 (2026-03-18)
* (René) changes requested by adapter checker and dependencies updated

### 1.2.15 (2025-10-22)
* (René) test release

### 1.2.14 (2025-10-21)
* (René) changes requested by adapter checker

### 1.2.13 (2025-10-04)
* (René) new testing
* (René) changes requested by adapter checker

### 1.2.12 (2025-02-28)
* (René) changes requested by adapter checker
* (René) dependencies updated

### 1.2.11 (2024-08-25)
* (René) update dependencies

### 1.2.10 (2024-05-28)
* (René) change of dependencies
* (René) new testing
* (René) nodejs >= 18, js-controller >= 5

### 1.2.9 (2024-01-12)
* (René) update dependencies

### 1.2.8 (2023-11-19)
* (René) update dependencies

### 1.2.7 (2023-04-07)
* (René) update dependencies

### 1.2.6 (2023-01-31)
* (René) update dependencies

### 1.2.5 (2022-08-18)
* (René) update dependencies

### 1.2.4 (2021-09-24)
* (René) bug fix: create Datapoints for year / month date

### 1.2.3 (2021-07-04)
* (René) bug fix: remove warnings regarding datatype with js-controller 3.3



[Older changelog](CHANGELOG_OLD.md)

## License

MIT License

Copyright (c) 2019-2026 René G. <info@rg-engineering.eu>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
