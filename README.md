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



**If you like it, please consider a donation:**
                                                                          
[![paypal](https://www.paypalobjects.com/en_US/DK/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/donate/?hosted_button_id=34ESBMJ932QZC) 

## Description
This adapter logs the minimum and maximum values of a given data point for today, the current month, and the current year.
The value is reset at the beginning of the period and changed to the current time.

## Settings
When the adapter is running, simply enable logging for the required data point in the object view. Optionally, you can assign a specific name.

## Changelog
<!--
  Placeholder for the next version (at the beginning of the line):
  ### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**
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

### 1.2.0 (2021-04-28)
* (René) admin 5 prepared

### 1.1.3 (2021-03-21)
* (René) dependencies updated

### 1.1.2 (2021-02-28)
* (René) some bug fixes

### 1.1.1 (2020-10-01)
* (René) some bug fixes

### 1.1.0 (2020-10-03)
* (René) diff values added (as an option)

### 1.0.2 (2020-07-24)
* (René) save optimisations

### 1.0.2 (2020-03-29)
* (René) path to config file changed

### 1.0.1 (2020-02-09)
* (René) some bug fixes

### 1.0.0 (2019-06-01)
* (René) first official release

### 0.1.1 (2019-06-01)
* (René) create path for setup data if not exists

### 0.1.0 (2019-01-05)
* (René) support of compact mode

### 0.0.4 (2018-12-25)
* (René) added cron to reset at midnight

### 0.0.3 (2018-12-22)
* (René) bug fix: today minimum not recorded

### 0.0.2 (2018-12-21)
* (René) initial release

## License

MIT License

Copyright (c) 2019-2025 René G. <info@rg-engineering.eu>

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
