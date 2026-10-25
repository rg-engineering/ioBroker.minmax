/* eslint-disable prefer-template */
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
"use strict";

// you have to require the utils module and call adapter function
//const utils = require('./lib/utils'); // Get common adapter utils
const utils = require("@iobroker/adapter-core");
const CronJob = require("cron").CronJob;

const timeConverter = require("./lib/support_tools.js").timeConverter;


//const adapter = utils.Adapter('minmax');

let lastUpdate = new Date();
let myObjects = [];
let adapter;
//let SystemLanguage;
let cronJobs = [];

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: "minmax",
        ready: function () {
            try {
                //adapter.log.debug("start");
                main();
            } catch (e) {
                adapter.log.error("exception catch after ready [" + e + "]");
            }
        },

        //#######################################
        //  is called when adapter shuts down
        unload: function (callback) {
            try {
                adapter && adapter.log && adapter.log.info && adapter.log.info("cleaned everything up...");
                CronStop();
                SaveSetup();
                callback();
            } catch (e) {
                adapter.log.error("exception catch after unload [" + e + "]");
                callback();
            }
        },
        //SIGINT: function () {
        //    adapter && adapter.log && adapter.log.info && adapter.log.info("cleaned everything up...");
        //    CronStop();

            
        //},

        //#######################################
        //  is called if a subscribed object changes
        objectChange: function (id, obj) {
            HandleObjectChange(id, obj);
        },

        //#######################################
        // is called if a subscribed state changes
        stateChange: function (id, state) {
            HandleStateChange(id, state);
        }


    });
    adapter = new utils.Adapter(options);

    return adapter;
}



//#######################################
// main entry
async function main() {

    ReadSetup();
    //SystemLanguage = await GetSystemLanguage();
    // subscribe to objects, so the settings in the object are arriving to the adapter
    adapter.subscribeForeignObjects("*");
    await UpdateSubsriptions();
    
    CronCreate();
    CronStatus();

}

/*
async function GetSystemLanguage() {
    let language = "de";
    const ret = await adapter.getForeignObjectAsync("system.config");

    language = ret.common.language;

    adapter.log.debug("got system language " + language);

    return language;
}
*/

//#######################################
async function HandleObjectChange(id, obj) {

    try {

        //adapter.log.debug("### before objects: " + JSON.stringify(myObjects) + " " + adapter.namespace);

        let sObjectName = id;

        let bEnabled = false;
        let bCalcDiff = false;
        //obj could be null or removed..
        if (obj && obj.common && obj.common.custom && obj.common.custom[adapter.namespace]) {

            adapter.log.debug("### " + JSON.stringify(obj.common.custom[adapter.namespace]));

            bEnabled = obj.common.custom[adapter.namespace].enabled;
            bCalcDiff = obj.common.custom[adapter.namespace].calcDiff;

            const sName = obj.common.custom[adapter.namespace].logName;
            if (sName.length > 0) {
                sObjectName = sName;
            }

            adapter.log.debug("xxx " + adapter.namespace + " " + sName + " " + bEnabled);
        }

        const obj1 = findObjectByKey(myObjects, "name", sObjectName);


        if (obj1 === null && bEnabled) {

            //not available; just add it to list
            adapter.log.debug("add to object list " + id);
            myObjects.push({
                id: id,
                name: sObjectName,
                enabled: true,
                calcDiff: bCalcDiff
            });
            UpdateSubsriptions();
            SaveSetup();
        } else {

            //if changed
            if (bEnabled) {
                adapter.log.debug("object " + id + " already there, change settings");

                obj1.name = sObjectName;
                obj1.calcDiff = bCalcDiff;
            } else {
                //if disabled, remove it from list
                adapter.log.debug("remove from object list " + id);

                //only when really in List
                if (RemoveObjectByKey(myObjects, "id", id)) {
                    UpdateSubsriptions();
                    SaveSetup();
                }
            }
        }
        //adapter.log.debug("### after objects: " + JSON.stringify(myObjects));


    } catch (e) {
        adapter.log.error("exception in OnObjectChange [" + e + "]");
    }
}


async function HandleStateChange(id, state) {

    adapter.log.debug("[STATE CHANGE] ==== " + id + " === " + JSON.stringify(state));

    const toReset = CheckReset();

    try {
        if (state && state.ack) {

            const obj1 = findObjectByKey(myObjects, "id", id);

            if (obj1 !== null) {
                const key = obj1.name;
                const calcDiff = obj1.calcDiff;
                const value = state.val;
                await CalcMinMax(key, value, toReset, calcDiff);
            }
        }
    } catch (e) {
        adapter.log.error("exception in OnStateChange [" + e + "]");
    }
}
function findObjectByKey(array, key, value) {

    /*
    adapter.log.debug("+++ search " + key + " " + value);
    
    if (typeof array !== "undefined") {
        const result = array.filter(d => d[key] == value);

        adapter.log.debug("found " + JSON.stringify(result));

        return result;
    }
    return null;
    */

    
    if (array !== undefined) {
        for (let i = 0; i < array.length; i++) {
            if (array[i][key] === value) {
                return array[i];
            }
        }
    }
    return null;
    
}


function RemoveObjectByKey(array, key, value) {

    //adapter.log.debug("+++ " + JSON.stringify(array));
    let retVal = false;

    if (array !== undefined) {
        for (let i = 0; i < array.length; i++) {
            if (array[i][key] === value) {

                //we do not need any information anymore, so unsubscribe
                adapter.unsubscribeForeignStates(array[i].name);
                //remove all states

                //and then remove from list 
                array.splice(i, 1);

                retVal = true;
                return retVal;
            }
        }
    }
    return retVal;
}

//#######################################
// is it time to reset?
function CheckReset() {
    const now = new Date();

    const bRet = { isNewDay: false, isNewMonth:false, isNewYear:false};

    //let minuteNow = now.getMinutes();
    //let minuteLast = lastUpdate.getMinutes();
    //adapter.log.debug('check reset now' + minuteNow + " last " + minuteLast);

    const dateNow = now.getDate();
    const dateLast = lastUpdate.getDate();

    if (dateNow !== dateLast) {
        bRet.isNewDay = true;
        adapter.log.debug("new day");
    }

    const monthNow = now.getMonth();
    const monthLast = lastUpdate.getMonth();
    if (monthNow !== monthLast) {
        bRet.isNewMonth = true;
        adapter.log.debug("new month");
    }

    const yearNow = now.getFullYear();
    const yearLast = lastUpdate.getFullYear();
    if (yearNow !== yearLast) {
        bRet.isNewYear = true;
        adapter.log.debug("new year");
    }


    lastUpdate = now;

    return bRet;
}

//#######################################
// main to check whether new value to be set
async function CalcMinMax(name, value, toReset, calcDiff) {
    let obj;

    let key = name + ".TodayMin";
    //adapter.log.debug(" == " + key);
    obj = await adapter.getStateAsync(key);
    adapter.log.debug(key + " === " + JSON.stringify(obj));
    let TodayMin = obj != null ? obj.val : 0;
    if ( obj === undefined || obj === null  || toReset.isNewDay || value < obj.val) {
        adapter.log.info(" ==== set new value for " + key + " " + value);
        TodayMin = value;
        await adapter.setStateAsync(key, { ack: true, val: value });
        await adapter.setStateAsync(key + "Time", { ack: true, val: timeConverter(null,true) });
    }

    key = name + ".TodayMax";
    //adapter.log.debug(" == " + key);
    obj = await adapter.getStateAsync(key);
    adapter.log.debug(key + " === " + JSON.stringify(obj));
    let TodayMax = obj != null ? obj.val : 0;
    if (obj === undefined || obj === null  || toReset.isNewDay || value > obj.val) {
        adapter.log.info(" ==== set new value for " + key + " " + value);
        TodayMax = value;
        await adapter.setStateAsync(key, { ack: true, val: value });
        await adapter.setStateAsync(key + "Time", { ack: true, val: timeConverter(null,true) });
    }

    key = name + ".MonthMin";
    //adapter.log.debug(" === " + key);
    obj = await adapter.getStateAsync(key);
    adapter.log.debug(key + " === " + JSON.stringify(obj));
    let MonthMin = obj != null ? obj.val : 0;
    if ( obj === undefined || obj === null  || toReset.isNewMonth || value < obj.val) {
        adapter.log.info(" ==== set new value for " + key + " " + value);
        MonthMin = value;
        await adapter.setStateAsync(key, { ack: true, val: value });
        await adapter.setStateAsync(key + "Date", { ack: true, val: timeConverter(null,false) });
    }

    key = name + ".MonthMax";
    //adapter.log.debug(" === " + key);
    obj = await adapter.getStateAsync(key);
    adapter.log.debug(key + " === " + JSON.stringify(obj));
    let MonthMax = obj != null ? obj.val : 0;
    if ( obj === undefined || obj === null  || toReset.isNewMonth || value > obj.val) {
        adapter.log.info(" ==== set new value for " + key + " " + value);
        MonthMax = value;
        await adapter.setStateAsync(key, { ack: true, val: value });
        await adapter.setStateAsync(key + "Date", { ack: true, val: timeConverter(null,false) });
    }

    key = name + ".YearMin";
    //adapter.log.debug(" === " + key);
    obj = await adapter.getStateAsync(key);
    adapter.log.debug(key + " === " + JSON.stringify(obj));
    let YearMin = obj != null ? obj.val : 0;
    if ( obj === undefined || obj === null  || toReset.isNewYear || value < obj.val) {
        adapter.log.info(" ==== set new value for " + key + " " + value);
        YearMin = value;
        await adapter.setStateAsync(key, { ack: true, val: value });
        await adapter.setStateAsync(key + "Date", { ack: true, val: timeConverter(null,false) });
    }

    key = name + ".YearMax";
    //adapter.log.debug(" === " + key);
    obj = await adapter.getStateAsync(key);
    adapter.log.debug(key + " === " + JSON.stringify(obj));
    let YearMax = obj != null ? obj.val : 0;
    if ( obj === undefined || obj === null  || toReset.isNewYear || value > obj.val) {
        adapter.log.info(" ==== set new value for " + key + " " + value);
        YearMax = value;
        await adapter.setStateAsync(key, { ack: true, val: value });
        await adapter.setStateAsync(key + "Date", { ack: true, val: timeConverter(null,false) });
    }

    if (calcDiff) {
        adapter.log.debug(" calculate difference ");

        const TodayDiff = TodayMax - TodayMin;
        const MonthDiff = MonthMax - MonthMin;
        const YearDiff = YearMax - YearMin;

        key = name + ".TodayDiff";
        await adapter.setStateAsync(key, { ack: true, val: TodayDiff });
        key = name + ".MonthDiff";
        await adapter.setStateAsync(key, { ack: true, val: MonthDiff });
        key = name + ".YearDiff";
        await adapter.setStateAsync(key, { ack: true, val: YearDiff });

    }


}


//#######################################
// create states and subscribe state
async function UpdateSubsriptions() {

    //unsubscribe all
    adapter.unsubscribeForeignStates("*");

    adapter.log.debug("!!!! UpdateSubsriptions ");

    if (myObjects !== undefined && myObjects.length > 0) {

        for (let i = 0; i < myObjects.length; i++) {
            adapter.log.info("subsribe " + myObjects[i].name);
            //subscribe to be informed
            adapter.subscribeForeignStates(myObjects[i].id);

            const value = await adapter.getForeignStateAsync(myObjects[i].id);
            const type = typeof value.val;
            //add states 

            AddObject(myObjects[i].name, "channel", "min and max",  type);
            AddObject(myObjects[i].name + ".TodayMin", "state", "todays minimum value",  type);
            AddObject(myObjects[i].name + ".TodayMinTime", "state", "todays minimum value", "string");
            AddObject(myObjects[i].name + ".TodayMax", "state", "todays maximum value",  type);
            AddObject(myObjects[i].name + ".TodayMaxTime", "state", "todays maximum value", "string");

            AddObject(myObjects[i].name + ".MonthMin", "state", "month minimum value",  type);
            AddObject(myObjects[i].name + ".MonthMinDate", "state", "month minimum value", "string");
            AddObject(myObjects[i].name + ".MonthMax", "state", "month maximum value",  type);
            AddObject(myObjects[i].name + ".MonthMaxDate", "state", "month maximum value", "string");

            AddObject(myObjects[i].name + ".YearMin", "state", "year minimum value",  type);
            AddObject(myObjects[i].name + ".YearMinDate", "state", "year minimum value", "string");
            AddObject(myObjects[i].name + ".YearMax", "state", "year maximum value",  type);
            AddObject(myObjects[i].name + ".YearMaxDate", "state", "year maximum value", "string");

            if (myObjects[i].calcDiff) {
                AddObject(myObjects[i].name + ".TodayDiff", "state", "today diff value",  type);
                AddObject(myObjects[i].name + ".MonthDiff", "state", "month diff value",  type);
                AddObject(myObjects[i].name + ".YearDiff", "state", "year diff value",  type);
            }

            /*
            adapter.setObjectNotExists(myObjects[i].name, {
                type: "channel",
                role: "statistic",
                common: { name: "min and max" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".TodayMin", {
                type: "state",
                role: "statistic",
                common: { name: "todays minimum value" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".TodayMinTime", {
                type: "state",
                role: "statistic",
                common: { name: "time of todays minimum value", type: "string" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".TodayMax", {
                type: "state",
                role: "statistic",
                common: { name: "todays maximum value" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".TodayMaxTime", {
                type: "state",
                role: "statistic",
                common: { name: "time of todays maximum value", type: "string" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".MonthMin", {
                type: "state",
                role: "statistic",
                common: { name: "month minimum value" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".MonthMinDate", {
                type: "state",
                role: "statistic",
                common: { name: "date and time of month minimum value", type: "string" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".MonthMax", {
                type: "state",
                role: "statistic",
                common: { name: "month maximum value" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".MonthMaxDate", {
                type: "state",
                role: "statistic",
                common: { name: "date and time of month maximum value", type: "string" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".YearMin", {
                type: "state",
                role: "statistic",
                common: { name: "year minimum value" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".YearMinDate", {
                type: "state",
                role: "statistic",
                common: { name: "date of year minimum value", type: "string" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".YearMax", {
                type: "state",
                role: "statistic",
                common: { name: "year maximum value" },
                native: { location: adapter.config.location }
            });
            adapter.setObjectNotExists(myObjects[i].name + ".YearMaxDate", {
                type: "state",
                role: "statistic",
                common: { name: "date of year maximum value", type: "string" },
                native: { location: adapter.config.location }
            });

            if (myObjects[i].calcDiff) {
                adapter.setObjectNotExists(myObjects[i].name + ".TodayDiff", {
                    type: "state",
                    role: "statistic",
                    common: { name: "today diff value", type: "string" },
                    native: { location: adapter.config.location }
                });
                adapter.setObjectNotExists(myObjects[i].name + ".MonthDiff", {
                    type: "state",
                    role: "statistic",
                    common: { name: "month diff value", type: "string" },
                    native: { location: adapter.config.location }
                });
                adapter.setObjectNotExists(myObjects[i].name + ".YearDiff", {
                    type: "state",
                    role: "statistic",
                    common: { name: "year diff value", type: "string" },
                    native: { location: adapter.config.location }
                });
                
            }
            */
        }


    } else {
        adapter.log.debug("nothing to subsribe");
    }

}


async function AddObject(key, type, name, datatyp) {

    adapter.log.debug("addObject " + key + " " + type + " " + name + " " + datatyp);

    await adapter.setObjectNotExistsAsync(key, {
        type: type,
        common: {
            name: name,
            type: datatyp,
            role: "value",
            unit: "",
            read: true,
            write: false
        },
        native: {
            location: key
        }
    });

    
    const obj = await adapter.getObjectAsync(key);

    if (obj != null) {
        //adapter.log.debug(" got Object " + JSON.stringify(obj));
        if (obj.common.role != "value"
            || obj.common.type != datatyp
            || obj.common.name != name
            || obj.type != type ) {
            adapter.log.debug(" !!! need to extend for " + key);
            await adapter.extendObject(key, {
                type: type,
                common: {
                    name: name,
                    type: datatyp,
                    role: "value",
                    unit: "",
                    read: true,
                    write: false
                },
                native: {
                    location: key
                }
            });
        }

    }
}

//#######################################
// we need to store setup to get it back after restart of adapter
const fs = require("fs");
const path = require("path");
const { saveConfig, readConfig } = require("./lib/configstore");

// Speichert die aktuelle Konfiguration (myObjects) persistent
function SaveSetup() {
    try {
        saveConfig(myObjects);
        adapter.log.debug("Konfiguration gespeichert.");
    } catch (e) {
        adapter.log.error("Fehler beim Speichern der Konfiguration: " + e);
    }
}

// Liest die Konfiguration (myObjects) aus dem persistenten Speicher
function ReadSetup() {
    try {
        const config = readConfig();
        if (Array.isArray(config)) {
            myObjects = config;
            adapter.log.debug("Konfiguration geladen.");
        } else {
            myObjects = [];
            adapter.log.debug("Keine gespeicherte Konfiguration gefunden, leere Liste verwendet.");
        }
    } catch (e) {
        myObjects = [];
        adapter.log.error("Fehler beim Laden der Konfiguration: " + e);
    }
}
