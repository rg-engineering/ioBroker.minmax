
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



//const adapter = utils.Adapter('minmax');

let lastUpdate = new Date();
let myObjects = [];
let adapter;
let SystemLanguage;
let cronJobs = [];

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: "minmax",
        ready: function () {
            try {
                //adapter.log.debug("start");
                main();
            }
            catch (e) {
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
                callback();
            }
        },
        SIGINT: function () {
            adapter && adapter.log && adapter.log.info && adapter.log.info("cleaned everything up...");
            CronStop();

            
        },

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
    SystemLanguage = await GetSystemLanguage();
    // subscribe to objects, so the settings in the object are arriving to the adapter
    adapter.subscribeForeignObjects("*");
    UpdateSubsriptions();
    
    CronCreate();
    getCronStat();

}

async function GetSystemLanguage() {
    let language = "de";
    const ret = await adapter.getForeignObjectAsync("system.config");

    language = ret.common.language;

    adapter.log.debug("got system language " + language);

    return language;
}

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
        }
        else {

            //if changed
            if (bEnabled) {
                adapter.log.debug("object " + id + " already there, change settings");

                obj1.name = sObjectName;
                obj1.calcDiff = bCalcDiff;
            }
            //if disabled, remove it from list
            else {
                adapter.log.debug("remove from object list " + id);

                //only when really in List
                if (RemoveObjectByKey(myObjects, "id", id)) {
                    UpdateSubsriptions();
                    SaveSetup();
                }
            }
        }
        //adapter.log.debug("### after objects: " + JSON.stringify(myObjects));


    }
    catch (e) {
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
    }
    catch (e) {
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

    
    if (typeof array !== "undefined") {
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

    if (typeof array !== "undefined") {
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
    if (typeof obj == undefined || obj === null || obj === undefined || toReset.isNewDay || value < obj.val) {
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
    if (typeof obj == undefined || obj === null || obj === undefined || toReset.isNewDay || value > obj.val) {
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
    if (typeof obj == undefined || obj === null || obj === undefined || toReset.isNewMonth || value < obj.val) {
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
    if (typeof obj == undefined || obj === null || obj === undefined || toReset.isNewMonth || value > obj.val) {
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
    if (typeof obj == undefined || obj === null || obj === undefined || toReset.isNewYear || value < obj.val) {
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
    if (typeof obj == undefined || obj === null || obj === undefined || toReset.isNewYear || value > obj.val) {
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


function timeConverter(time, timeonly=false) {

    let a;
    if (time != null) {
        a = new Date(time);
    }
    else {
        a = new Date();
    }
    let months;
    if (SystemLanguage === "de") {
        months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    }
    else {
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    }
    const year = a.getFullYear();
    const month = months[a.getMonth()];
    let date = a.getDate();
    date = date < 10 ? " " + date : date;
    let hour = a.getHours();
    hour = hour < 10 ? "0" + hour : hour;
    let min = a.getMinutes();
    min = min < 10 ? "0" + min : min;
    let sec = a.getSeconds();
    sec = sec < 10 ? "0" + sec : sec;

    let sRet = "";
    if (timeonly) {
        sRet = hour + ":" + min + ":" + sec;
    }
    else {
        sRet = date + " " + month + " " + year + " " + hour + ":" + min + ":" + sec;
    }

    return sRet;
}

/*
function timeConverter(timeonly) {
    const a = new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const year = a.getFullYear();
    const month = months[a.getMonth()];
    let date = a.getDate();
    date = date < 10 ? " " + date : date;
    let hour = a.getHours();
    hour = hour < 10 ? "0" + hour : hour;
    let min = a.getMinutes();
    min = min < 10 ? "0" + min : min;
    let sec = a.getSeconds();
    sec = sec < 10 ? "0" + sec : sec;

    let sRet = "";
    if (timeonly) {
        sRet = hour + ":" + min + ":" + sec;
    }
    else {
        sRet = date + " " + month + " " + year + " " + hour + ":" + min + ":" + sec;
    }

    return sRet;
}
*/


//#######################################
// create states and subscribe state
function UpdateSubsriptions() {

    //unsubscribe all
    adapter.unsubscribeForeignStates("*");

    adapter.log.debug("!!!! UpdateSubsriptions ");

    if (typeof myObjects !== "undefined" && myObjects.length > 0) {

        for (let i = 0; i < myObjects.length; i++) {
            adapter.log.debug("subsribe " + myObjects[i].name);
            //subscribe to be informed
            adapter.subscribeForeignStates(myObjects[i].id);

            //add states to do 
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

        }


    }
    else {
        adapter.log.debug("nothing to subsribe");
    }

}


//#######################################
// we need to store setup to get it back after restart of adapter
const fs = require("fs");
const path = require("path");
//var dataDir = path.normalize(utils.controllerDir + '/' + require(utils.controllerDir + '/lib/tools').getDefaultDataDir());
//var cacheFile = dataDir + 'minmax.json';

//to do: besser im eigenen Install-Verzeichnis
//const cachePath = path.normalize(utils.controllerDir + "/iobroker-data/");
const cachePath = path.normalize(__dirname + "/../../" + "iobroker-data/minmax/");
const cacheFile = cachePath +"minmax.json";

//const rootDir = path.normalize(__dirname + "/../../" + "iobroker-data/minmax");

//opt/iobroker/node_modules/iobroker.js-controller/iobroker-data/minmax.json']

function SaveSetup() {


    //to do: Rechte richtig?
    if (!fs.existsSync(cachePath)) {
        adapter.log.info("creating path " + cachePath);
        fs.mkdirSync(cachePath);
    }


    const fileData = {};
    try {
        fileData.myObjects = myObjects;

        fs.writeFileSync(cacheFile, JSON.stringify(fileData));

        adapter.log.debug("config stored in " + cachePath);
    }
    catch (e) {
        adapter.log.error("exception in SaveSetup [" + e + "]");
    }

}

function ReadSetup() {


    adapter.log.info("reading " + cacheFile);

    try {
        //if (fs.statSync(cacheFile).isFile()) {
        const fileContent = fs.readFileSync(cacheFile);
        const tempData = JSON.parse(fileContent, function (key, value) {

            return value;
        });
        if (tempData.myObjects) myObjects = tempData.myObjects;

        adapter.log.debug("### after file read objects: " + JSON.stringify(myObjects));
        //fs.unlinkSync(cacheFile);
        //}
    }
    catch (err) {
        adapter.log.warn("No stored data from last exit found " + err);
    }

}

//#######################################
// reset at midnight


function CronCreate() {
    const timezone = adapter.config.timezone || "Europe/Berlin";

    // test every minute
    //crons.daySave = new CronJob('0 * * * * *',
    const nextCron = cronJobs.length;
    //details see https://www.npmjs.com/package/cron
    const cronString = "0 0 0 * * *";

    adapter.log.debug("start cron " + cronString + " " + timezone);

    cronJobs[nextCron] = new CronJob(cronString,
        () => ResetValues(),
        () => adapter.log.debug("cron job stopped"), // This function is executed when the job stops
        true,
        timezone
    );

}

async function ResetValues() {


    adapter.log.info("check to reset?");
    const toReset = CheckReset();

    //test only; to be removed
    //toReset.isNewDay = true;

    try {
        for (let i = 0; i < myObjects.length; i++) {
      
            if (myObjects[i] !== null) {

                await getCurrentValue(i, toReset);
            }
        }
    }
    catch (e) {
        adapter.log.error("exception in ResetValues [" + e + "]");
    }
    getCronStat();
}


async function getCurrentValue(idx, toReset) {

    adapter.log.debug("get value for " + myObjects[idx].id);

    const id = myObjects[idx].id;
    const name = myObjects[idx].name;
    const calcDiff = myObjects[idx].calcDiff;

    const obj = await adapter.getForeignStateAsync(id);

    adapter.log.debug("+++ " + JSON.stringify(obj));
    //{ "val": 93, "ack": true, "ts": 1545926525405, "q": 0, "from": "system.adapter.hm-rpc.0", "lc": 1545925016555 }
    //{ "val": 3.9, "ack": true, "ts": 1545926525360, "q": 0, "from": "system.adapter.hm-rpc.0", "lc": 1545926375376 }

    if (obj !== null) {
        adapter.log.debug("reset for " + name + " to " + obj.val);
        await CalcMinMax(name, obj.val, toReset, calcDiff);
    }

}


function getCronStat() {
    let n = 0;
    let length = 0;
    try {
        if (typeof cronJobs !== undefined && cronJobs != null) {

            length = cronJobs.length;
            //adapter.log.debug("cron jobs");
            for (n = 0; n < length; n++) {
                if (typeof cronJobs[n] !== undefined && cronJobs[n] != null) {
                    adapter.log.debug("cron status = " + cronJobs[n].running + " next event: " + timeConverter(cronJobs[n].nextDates(),false));
                }
            }

            if (length > 500) {
                adapter.log.warn("more then 500 cron jobs existing for this adapter, this might be a configuration error! (" + length + ")");
            }
            else {
                adapter.log.info(length + " cron job(s) created");
            }
        }
    }
    catch (e) {
        adapter.log.error("exception in getCronStat [" + e + "] : " + n + " of " + length);
    }
}

function CronStop() {
    if (cronJobs.length > 0) {
        adapter.log.debug("delete " + cronJobs.length + " cron jobs");
        //cancel all cron jobs...
        const start = cronJobs.length - 1;
        for (let n = start; n >= 0; n--) {
            //adapter.log.debug("stop cron job " + n);
            cronJobs[n].stop();
        }
        cronJobs = [];
    }
}




// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
} 
