﻿![Logo](admin/minmax.png)
# ioBroker.minmax
![Number of Installations](http://iobroker.live/badges/minmax-installed.svg) ![Number of Installations](http://iobroker.live/badges/minmax-stable.svg) 

[![NPM version](https://img.shields.io/npm/v/iobroker.minmax.svg)](https://www.npmjs.com/package/iobroker.minmax)
[![Downloads](https://img.shields.io/npm/dm/iobroker.minmax.svg)](https://www.npmjs.com/package/iobroker.minmax)
[![Tests](https://travis-ci.org/rg-engineering/ioBroker.minmax.svg?branch=master)](https://travis-ci.org/rg-engineering/ioBroker.minmax)

[![NPM](https://nodei.co/npm/iobroker.minmax.png?downloads=true)](https://nodei.co/npm/iobroker.minmax/)


## Description
This adapter logs the minimum and maximum values of a given data point for today, the current month, and the current year.
The value is reset at the beginning of the period and changed to the current time.

## Settings
When the adapter is running, simply enable logging for the required data point in the object view. Optionally, you can assign a specific name.

## Changelog

### 0.1.0 (2019-01-05)
* (René) support of compact mode

### 0.0.4 (2018-12-25)
* (René) added cron to reset at midnight

### 0.0.3 (2018-12-22)
* (René) bug fix: today minimum not recorded

### 0.0.2 (2018-12-21)
* (René) initial release 

## License

Copyright (C) <2018-2019>  <info@rg-engineering.eu>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


