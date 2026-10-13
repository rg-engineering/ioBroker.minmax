/* eslint-disable prefer-template */
import type { Minmax } from "../main";

import type { MinmaxConfig } from './adapter-config';
import Base from "./base";



export default class minmaxvalue extends Base {

    name: string;
    oid: string;
    calcdiff: boolean;

    constructor(adapter: Minmax, id: number, config: MinmaxConfig) {
        super(adapter, id, config.name);

        this.name = config.name;
        this.oid = config.oid;
        this.calcdiff = config.calcdif;
    }

    async Start(): Promise<void> {
        await this.CreateObjects();


    }


    async CreateObjects(): Promise<void> {

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

}