/* eslint-disable prefer-template */
import * as fs from "fs";
import * as path from "path";
import type { Minmax } from "../main";
import type { MinmaxConfig } from './adapter-config';

export default class ConfigStore {

    private adapter: Minmax;
    private cachePath: string;
    private cacheFile: string;

    myObjects: MinmaxConfig[] = [];

    constructor(adapter: Minmax) {
        this.adapter = adapter;
        this.cachePath = path.normalize(__dirname + "/../../" + "iobroker-data/minmax/");
        this.cacheFile = this.cachePath + "minmax.json";
    }

    SaveOldSetup(): void {

        //to do: Rechte richtig?
        if (!fs.existsSync(this.cachePath)) {
            this.adapter.log.info("creating path " + this.cachePath);
            fs.mkdirSync(this.cachePath, { recursive: true });
        }

        try {
            // store as object to be consistent on read
            fs.writeFileSync(this.cacheFile, JSON.stringify({ myObjects: this.myObjects }, null, 2), "utf8");
            this.adapter.log.debug("config stored in " + this.cachePath);
        } catch (e) {
            this.adapter.log.error("exception in SaveSetup [" + String(e) + "]");
        }

    }

    ReadOldSetup(): MinmaxConfig[] {

        this.adapter.log.info("reading " + this.cacheFile);

        try {
            // read as string to avoid Buffer/NonSharedBuffer type issues
            const fileContent = fs.readFileSync(this.cacheFile, "utf8");
            const tempData = JSON.parse(fileContent);

            if (Array.isArray(tempData)) {
                // handle case where file contains an array
                this.myObjects = tempData;
            } else if (tempData && tempData.myObjects) {
                this.myObjects = tempData.myObjects;
            } else {
                this.adapter.log.warn("unexpected data format in " + this.cacheFile);
            }

            this.adapter.log.debug("### after file read objects: " + JSON.stringify(this.myObjects));
        } catch (err) {
            this.adapter.log.warn("No stored data from last exit found " + String(err));
        }
        return this.myObjects
    }

    RemoveOldSetup(): void {

        try {
            if (fs.existsSync(this.cacheFile)) {
                fs.unlinkSync(this.cacheFile);
                this.adapter.log.info("removed " + this.cacheFile);
            }
        } catch (err) {
            this.adapter.log.error("Error removing " + this.cacheFile + ": " + String(err));
        }
    }

}