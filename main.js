
/*
 * min max adapter für iobroker
 *
 * Created: 07.12.2018 21:12:28
 *  Author: Rene

Copyright(C)[2018][René Glaß]

*/

/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
//const utils = require('./lib/utils'); // Get common adapter utils
const utils = require('@iobroker/adapter-core');


const adapter = utils.Adapter('minmax');

var lastUpdate = new Date();
var myObjects = [];


// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', callback => {
    try {
        adapter && adapter.log && adapter.log.info && adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }

});

// is called if a subscribed object changes
adapter.on('objectChange', (id, obj) => {
    // Warning, obj can be null if it was deleted
    adapter.log.debug('### received objectChange ' + id + ' obj  ' + JSON.stringify(obj));

    /*
    minmax.0 received objectChange daswetter.0.NextHours.Location_1.Day_1.Hour_1.clouds_value obj 
    { "type": "state", 
      "common": 
           { "name": "clouds", 
             "type": "string", 
             "role": "weather.clouds.forecast.0", 
             "unit": "%", 
             "read": true, 
             "write": false, 
             "custom": 
                 { "minmax.0": 
                     { "enabled": true,   <- wir brauchen das
                     "logName": "Wolken"  <- und das
                     } 
                 }
           },
      "from": "system.adapter.daswetter.0", 
      "ts": 1541954105039, 
      "_id": "daswetter.0.NextHours.Location_1.Day_1.Hour_1.clouds_value", 
      "acl": 
           { "object": 1636, 
             "state": 1636, 
             "owner": "system.user.admin", 
             "ownerGroup": "system.group.administrator" 
           } 
    }
    */

    try {

        adapter.log.debug("### before objects: " + JSON.stringify(myObjects));

        var sObjectName = id;
        var obj1 = findObjectByKey(myObjects, 'name', sObjectName);
        var bEnabled = false;
        //obj could be null ir removed..
        if (obj && obj.common && obj.common.custom && obj.common.custom[adapter.namespace]) {
            bEnabled = obj.common.custom[adapter.namespace].enabled;

            var sName = obj.common.custom[adapter.namespace].logName;
            if (sName.length > 0) {
                sObjectName = sName;
            }
        }

        if (obj1 === null && bEnabled) {
            //not available; just add it to list
            adapter.log.debug("add to object list " + id);
            myObjects.push({
                id: id,
                name: sObjectName,
                enabled: true
            });
        }
        else {
            //if disabled, remove it from list
            if (bEnabled) {
                adapter.log.debug("object " + id + " already there");
            }
            else {
                adapter.log.debug("remove from object list " + id);

                RemoveObjectByKey(myObjects, 'name', id);
            }
        }
        adapter.log.debug("### after objects: " + JSON.stringify(myObjects));
        UpdateSubsriptions();
        SaveSetup();
    }
    catch (e) {
        adapter.log.error('exception in OnObjectChange [' + e + ']');
    }

});

// is called if a subscribed state changes
adapter.on('stateChange', (id, state) => {
    // Warning, state can be null if it was deleted
    adapter.log.debug('[STATE CHANGE] ==== ' + id + ' === ' + JSON.stringify(state));

    var toReset=CheckReset();


    try {

        if (state && state.ack) {

            var obj1 = findObjectByKey(myObjects, 'id', id);

            if (obj1 != null) {
                var key = obj1.name + '.TodayMin';
                var value = state.val;

                //adapter.log.debug(' === ' + key);
                adapter.getState(key, function (err, obj) {
                    if (err) {
                        adapter.log.error(err);

                    } else {
                        //adapter.log.debug(' === ' + JSON.stringify(obj));
                        if (obj == null || value < obj.val || toReset.isNewDay) {
                            adapter.setState(key, { ack: true, val: value });
                            adapter.setState(key + "Time", { ack: true, val: timeConverter(true)  });
                        }
                    }
                    key = obj1.name + '.TodayMax';
                    //adapter.log.debug(' === ' + key);
                    adapter.getState(key, function (err, obj) {
                        if (err) {
                            adapter.log.error(err);

                        } else {

                            if (obj == null || value > obj.val || toReset.isNewDay) {
                                adapter.setState(key, { ack: true, val: value });
                                adapter.setState(key + "Time", { ack: true, val: timeConverter(true) });
                            }
                        }
                        key = obj1.name + '.MonthMin';
                        //adapter.log.debug(' === ' + key);
                        adapter.getState(key, function (err, obj) {
                            if (err) {
                                adapter.log.error(err);

                            } else {

                                if (obj == null || value < obj.val || toReset.isNewMonth) {
                                    adapter.setState(key, { ack: true, val: value });
                                    adapter.setState(key + "Date", { ack: true, val: timeConverter(false) });
                                }
                            }
                            key = obj1.name + '.MonthMax';
                            //adapter.log.debug(' === ' + key);
                            adapter.getState(key, function (err, obj) {
                                if (err) {
                                    adapter.log.error(err);

                                } else {

                                    if (obj == null || value > obj.val || toReset.isNewMonth) {
                                        adapter.setState(key, { ack: true, val: value });
                                        adapter.setState(key + "Date", { ack: true, val: timeConverter(false) });
                                    }
                                }
                                key = obj1.name + '.YearMin';
                                //adapter.log.debug(' === ' + key);
                                adapter.getState(key, function (err, obj) {
                                    if (err) {
                                        adapter.log.error(err);

                                    } else {

                                        if (obj == null || value < obj.val || toReset.isNewYear) {
                                            adapter.setState(key, { ack: true, val: value });
                                            adapter.setState(key + "Date", { ack: true, val: timeConverter(false) });
                                        }
                                    }
                                    key = obj1.name + '.YearMax';
                                    //adapter.log.debug(' === ' + key);
                                    adapter.getState(key, function (err, obj) {
                                        if (err) {
                                            adapter.log.error(err);

                                        } else {

                                            if (obj == null || value > obj.val || toReset.isNewYear) {
                                                adapter.setState(key, { ack: true, val: value });
                                                adapter.setState(key + "Date", { ack: true, val: timeConverter(false) });
                                            }
                                        }
                                    });
                                });
                            });
                        });
                    });
                });
            }
        }
    }
    catch (e) {
        adapter.log.error('exception in OnStateChange [' + e + ']');
    }

});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', obj => {

    if (obj) {
        switch (obj.command) {
            default:
                break;
        }
    }
    
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', main);


function main() {

    ReadSetup();
    // subscribe to objects, so the settings in the object are arriving to the adapter
    adapter.subscribeForeignObjects('*');
    UpdateSubsriptions();
}


function findObjectByKey(array, key, value) {

    //adapter.log.debug("+++ " + JSON.stringify(array));

    if (typeof array !== 'undefined') {
        for (var i = 0; i < array.length; i++) {
            if (array[i][key] === value) {
                return array[i];
            }
        }
    }
    return null;
}


function RemoveObjectByKey(array, key, value) {

    //adapter.log.debug("+++ " + JSON.stringify(array));
    var retVal = false;

    if (typeof array !== 'undefined') {
        for (var i = 0; i < array.length; i++) {
            if (array[i][key] === value) {

                //we do not need any information anymore, so unsubscribe
                adapter.unsubscribeForeignStates(array[i].name);
                //remove all states to do


                //and then remove from list 
                array.splice(i, 1);

                retVal = true;
                return retVal;
            }
        }
    }
    return retVal;
}


function CheckReset() {
    const now = new Date();

    var bRet = { isNewDay: false, isNewMonth:false, isNewYear:false};;

    //let minuteNow = now.getMinutes();
    //let minuteLast = lastUpdate.getMinutes();
    //adapter.log.debug('check reset now' + minuteNow + " last " + minuteLast);

    let dateNow = now.getDate();
    let dateLast = lastUpdate.getDate();

    if (dateNow != dateLast) {
        bRet.isNewDay = true;
        adapter.log.debug('new day');
    }

    let monthNow = now.getMonth();
    let monthLast = lastUpdate.getMonth();
    if (monthNow != monthLast) {
        bRet.isNewMonth = true;
        adapter.log.debug('new month');
    }

    let yearNow = now.getFullYear();
    let yearLast = lastUpdate.getFullYear();
    if (yearNow != yearLast) {
        bRet.isNewYear = true;
        adapter.log.debug('new year');
    }


    lastUpdate = now;

    return bRet;
}

function timeConverter(timeonly) {
    const a = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = a.getFullYear();
    const month = months[a.getMonth()];
    let date = a.getDate();
    date = date < 10 ? ' ' + date : date;
    let hour = a.getHours();
    hour = hour < 10 ? '0' + hour : hour;
    let min = a.getMinutes();
    min = min < 10 ? '0' + min : min;
    let sec = a.getSeconds();
    sec = sec < 10 ? '0' + sec : sec;

    var sRet = "";
    if (timeonly) {
        sRet = hour + ':' + min + ':' + sec;
    }
    else {
        sRet = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec
    }

    return sRet;
}

function UpdateSubsriptions() {

    //unsubscribe all
    adapter.unsubscribeForeignStates('*');

    adapter.log.debug("!!!! UpdateSubsriptions ");

    if (typeof myObjects !== 'undefined' && myObjects.length > 0) {

        for (var i = 0; i < myObjects.length; i++) {
            adapter.log.debug("subsribe " + myObjects[i].name);
            //subscribe to be informed
            adapter.subscribeForeignStates(myObjects[i].id);

            //add states to do 
            adapter.setObjectNotExists(myObjects[i].name, {
                type: 'channel',
                role: 'statistic',
                common: { name: 'min and max' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.TodayMin', {
                type: 'state',
                role: 'statistic',
                common: { name: 'todays minimum value' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.TodayMinTime', {
                type: 'state',
                role: 'statistic',
                common: { name: 'time of todays minimum value', type: 'string' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.TodayMax', {
                type: 'state',
                role: 'statistic',
                common: { name: 'todays maximum value' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.TodayMaxTime', {
                type: 'state',
                role: 'statistic',
                common: { name: 'time of todays maximum value', type: 'string' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.MonthMin', {
                type: 'state',
                role: 'statistic',
                common: { name: 'month minimum value' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.MonthMinDate', {
                type: 'state',
                role: 'statistic',
                common: { name: 'date and time of month minimum value', type: 'string' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.MonthMax', {
                type: 'state',
                role: 'statistic',
                common: { name: 'month maximum value' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.MonthMaxDate', {
                type: 'state',
                role: 'statistic',
                common: { name: 'date and time of month maximum value', type: 'string' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.YearMin', {
                type: 'state',
                role: 'statistic',
                common: { name: 'year minimum value' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.YearMinDate', {
                type: 'state',
                role: 'statistic',
                common: { name: 'date of year minimum value', type: 'string' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.YearMax', {
                type: 'state',
                role: 'statistic',
                common: { name: 'year maximum value' },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + '.YearMaxDate', {
                type: 'state',
                role: 'statistic',
                common: { name: 'date of year maximum value', type: 'string' },
                native: { location: adapter.config.location }
            });
        }


    }
    else {
        adapter.log.debug("nothing to subsribe");
    }

}


//#######################################
// we need to store setup to get it back after restart of adapter
var fs = require('fs');
var path = require('path');
var dataDir = path.normalize(utils.controllerDir + '/' + require(utils.controllerDir + '/lib/tools').getDefaultDataDir());
var cacheFile = dataDir + 'minmax.json';

function SaveSetup() {

    var fileData = {};

    fileData.myObjects = myObjects;

    fs.writeFileSync(cacheFile, JSON.stringify(fileData));
}

function ReadSetup() {
    try {
        if (fs.statSync(cacheFile).isFile()) {
            var fileContent = fs.readFileSync(cacheFile);
            var tempData = JSON.parse(fileContent, function (key, value) {
                
                return value;
            });
            if (tempData.myObjects) myObjects = tempData.myObjects;
           
            adapter.log.debug("### after file read objects: " + JSON.stringify(myObjects));
            fs.unlinkSync(cacheFile);
        }
    }
    catch (err) {
        adapter.log.info('No stored data from last exit found');
    }

}