/* eslint-disable prefer-template */
import type { Minmax } from "../main";

import type { MinmaxConfig } from './adapter-config';
import Base from "./base";


interface toReset {
    isNewDay: boolean;
    isNewMonth: boolean;
    isNewYear: boolean;
}

export default class minmaxvalue extends Base {

    name: string;
    oid: string;
    calcdiff: boolean;

    lastUpdate: Date;

    constructor(adapter: Minmax, id: number, config: MinmaxConfig) {
        super(adapter, id, config.name);

        this.name = config.name;
        this.oid = config.oid;
        this.calcdiff = config.calcdif;
        this.lastUpdate = new Date(0);
    }

    async Start(): Promise<void> {
        await this.CreateObjects();
        this.logInfo("subsribe " + this.name);
        //subscribe to be informed
        this.adapter.subscribeForeignStates(this.oid);
    }


    async CreateObjects(): Promise<void> {

        this.logInfo("creating datapoints");

        await this.CreateDatapoint(this.name, "channel", "", "", "", false, false, "min and max",);
        await this.CreateDatapoint(this.name + ".TodayMin", "state", "value", "number", "", true, false, "todays minimum value");
        await this.CreateDatapoint(this.name + ".TodayMinTime", "state", "date", "string", "", true, false, "todays minimum value time");
        await this.CreateDatapoint(this.name + ".TodayMax", "state", "value", "number", "", true, false, "todays maximum value");
        await this.CreateDatapoint(this.name + ".TodayMaxTime", "state", "date", "string", "", true, false, "todays maximum value time");

        await this.CreateDatapoint(this.name + ".MonthMin", "state", "value", "number", "", true, false, "month minimum value");
        await this.CreateDatapoint(this.name + ".MonthMinDate", "state", "date", "string", "", true, false, "month minimum value date");
        await this.CreateDatapoint(this.name + ".MonthMax", "state", "value", "number", "", true, false, "month maximum value");
        await this.CreateDatapoint(this.name + ".MonthMaxDate", "state", "date", "string", "", true, false, "month maximum value date");

        await this.CreateDatapoint(this.name + ".YearMin", "state", "value", "number", "", true, false, "year minimum value");
        await this.CreateDatapoint(this.name + ".YearMinDate", "state", "date", "string", "", true, false, "year minimum value date");
        await this.CreateDatapoint(this.name + ".YearMax", "state", "value", "number", "", true, false, "year maximum value");
        await this.CreateDatapoint(this.name + ".YearMaxDate", "state", "date", "string", "", true, false, "year maximum value date");

        if (this.calcdiff) {
            await this.CreateDatapoint(this.name + ".TodayDiff", "state", "value", "number", "", true, false, "today diff value");
            await this.CreateDatapoint(this.name + ".MonthDiff", "state", "value", "number", "", true, false, "month diff value");
            await this.CreateDatapoint(this.name + ".YearDiff", "state", "value", "number", "", true, false, "year diff value");
        }

    }


    async onStateChange(state: ioBroker.State): Promise<void> {

        const newValue = Number(state.val);

        const toReset = this.CheckReset();
        await this.CalcMinMax(newValue, toReset, this.calcdiff);
    }



    async CalcMinMax(value: number, toReset: toReset, calcDiff: boolean): Promise<void> {
        let obj;

        let key = this.name + ".TodayMin";
        //adapter.log.debug(" == " + key);
        obj = await this.adapter.getStateAsync(key);
        this.logDebug(key + " === " + JSON.stringify(obj));
        let TodayMin = obj != null ? Number(obj.val) : 0;
        if (obj === undefined || obj === null || toReset.isNewDay || value < Number(obj.val)) {
            this.logInfo(" ==== set new value for " + key + " " + value);
            TodayMin = value;
            await this.adapter.setState(key, { ack: true, val: value });
            await this.adapter.setState(key + "Time", { ack: true, val: this.timeConverter("de", null, true) });
        }

        key = this.name + ".TodayMax";
        //adapter.log.debug(" == " + key);
        obj = await this.adapter.getStateAsync(key);
        this.logDebug(key + " === " + JSON.stringify(obj));
        let TodayMax = obj != null ? Number(obj.val) : 0;
        if (obj === undefined || obj === null || toReset.isNewDay || value > Number(obj.val)) {
            this.logInfo(" ==== set new value for " + key + " " + value);
            TodayMax = value;
            await this.adapter.setState(key, { ack: true, val: value });
            await this.adapter.setState(key + "Time", { ack: true, val: this.timeConverter("de", null, true) });
        }

        key = this.name + ".MonthMin";
        //adapter.log.debug(" === " + key);
        obj = await this.adapter.getStateAsync(key);
        this.logDebug(key + " === " + JSON.stringify(obj));
        let MonthMin = obj != null ? Number(obj.val) : 0;
        if (obj === undefined || obj === null || toReset.isNewMonth || value < Number(obj.val)) {
            this.logInfo(" ==== set new value for " + key + " " + value);
            MonthMin = value;
            await this.adapter.setState(key, { ack: true, val: value });
            await this.adapter.setState(key + "Date", { ack: true, val: this.timeConverter("de", null, false) });
        }

        key = this.name + ".MonthMax";
        //adapter.log.debug(" === " + key);
        obj = await this.adapter.getStateAsync(key);
        this.logDebug(key + " === " + JSON.stringify(obj));
        let MonthMax = obj != null ? Number(obj.val) : 0;
        if (obj === undefined || obj === null || toReset.isNewMonth || value > Number(obj.val)) {
            this.logInfo(" ==== set new value for " + key + " " + value);
            MonthMax = value;
            await this.adapter.setState(key, { ack: true, val: value });
            await this.adapter.setState(key + "Date", { ack: true, val: this.timeConverter("de", null, false) });
        }

        key = this.name + ".YearMin";
        //adapter.log.debug(" === " + key);
        obj = await this.adapter.getStateAsync(key);
        this.logDebug(key + " === " + JSON.stringify(obj));
        let YearMin = obj != null ? Number(obj.val) : 0;
        if (obj === undefined || obj === null || toReset.isNewYear || value < Number(obj.val)) {
            this.logInfo(" ==== set new value for " + key + " " + value);
            YearMin = value;
            await this.adapter.setState(key, { ack: true, val: value });
            await this.adapter.setState(key + "Date", { ack: true, val: this.timeConverter("de", null, false) });
        }

        key = this.name + ".YearMax";
        //adapter.log.debug(" === " + key);
        obj = await this.adapter.getStateAsync(key);
        this.logDebug(key + " === " + JSON.stringify(obj));
        let YearMax = obj != null ? Number(obj.val) : 0;
        if (obj === undefined || obj === null || toReset.isNewYear || value > Number(obj.val)) {
            this.logInfo(" ==== set new value for " + key + " " + value);
            YearMax = value;
            await this.adapter.setState(key, { ack: true, val: value });
            await this.adapter.setState(key + "Date", { ack: true, val: this.timeConverter("de",null, false) });
        }

        if (calcDiff) {
            this.logDebug(" calculate difference ");

            const TodayDiff = (TodayMax != null && TodayMin != null) ? TodayMax - TodayMin : 0;
            const MonthDiff = (MonthMax != null && MonthMin != null) ? MonthMax - MonthMin : 0;
            const YearDiff = (YearMax != null && YearMin != null) ? YearMax - YearMin : 0;

            key = this.name + ".TodayDiff";
            await this.adapter.setState(key, { ack: true, val: TodayDiff });
            key = this.name + ".MonthDiff";
            await this.adapter.setState(key, { ack: true, val: MonthDiff });
            key = this.name + ".YearDiff";
            await this.adapter.setState(key, { ack: true, val: YearDiff });

        }


    }


    //#######################################
    // is it time to reset?
    CheckReset():toReset {
        const now = new Date();

        const bRet = { isNewDay: false, isNewMonth: false, isNewYear: false };

        const dateNow = now.getDate();
        const dateLast = this.lastUpdate.getDate();

        if (dateNow !== dateLast) {
            bRet.isNewDay = true;
            this.logDebug("new day");
        }

        const monthNow = now.getMonth();
        const monthLast = this.lastUpdate.getMonth();
        if (monthNow !== monthLast) {
            bRet.isNewMonth = true;
            this.logDebug("new month");
        }

        const yearNow = now.getFullYear();
        const yearLast = this.lastUpdate.getFullYear();
        if (yearNow !== yearLast) {
            bRet.isNewYear = true;
            this.logDebug("new year");
        }

        this.lastUpdate = now;

        return bRet;
    }
}