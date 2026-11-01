"use strict";
/* eslint-disable prefer-template */
/*
 * Created with @iobroker/create-adapter v2.6.5
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Minmax = void 0;
//https://www.iobroker.net/#en/documentation/dev/adapterdev.md
const utils = __importStar(require("@iobroker/adapter-core"));
const node_path_1 = require("node:path");
const boundary_scheduler_1 = __importDefault(require("./lib/boundary-scheduler"));
const error_utils_1 = require("./lib/error-utils");
const legacy_config_migrator_1 = __importDefault(require("./lib/legacy-config-migrator"));
const minmax_controller_1 = __importDefault(require("./lib/minmax-controller"));
class Minmax extends utils.Adapter {
    minmaxController;
    boundaryScheduler;
    constructor(options = {}) {
        super({
            ...options,
            name: "minmax",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("objectChange", this.onObjectChange.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        const timeZone = this.config.timezone || "Europe/Berlin";
        try {
            new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
        }
        catch (error) {
            this.log.error(`Invalid timezone configuration "${timeZone}": ${(0, error_utils_1.describeError)(error)}`);
            throw error;
        }
        this.log.debug(`Starting with timezone ${timeZone}`);
        const controller = new minmax_controller_1.default(this);
        this.minmaxController = controller;
        const scheduler = new boundary_scheduler_1.default(timeZone, (resetPeriods) => controller.handleBoundary(resetPeriods), (error) => this.log.error(`Calendar boundary job failed: ${(0, error_utils_1.describeError)(error)}`));
        this.boundaryScheduler = scheduler;
        this.subscribeForeignObjects("*");
        const legacyConfigPath = (0, node_path_1.join)(utils.getAbsoluteDefaultDataDir(), "minmax", "minmax.json");
        await new legacy_config_migrator_1.default(this, legacyConfigPath).migrate();
        const objects = await this.getForeignObjectsAsync("*", "state");
        await controller.initialize(objects);
        await scheduler.start();
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        void (async () => {
            try {
                await this.boundaryScheduler?.stop();
                await this.minmaxController?.stop();
                this.unsubscribeForeignObjects("*");
            }
            catch (error) {
                this.log.error(`Failed to stop minmax controller: ${(0, error_utils_1.describeError)(error)}`);
            }
            finally {
                callback();
            }
        })();
    }
    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    async onObjectChange(id, obj) {
        await this.minmaxController?.handleObjectChange(id, obj);
        if (obj) {
            // The object was changed
            this.log.debug(`object ${id} changed`);
            /*
            {
                "type": "state",
                "common": {
                    "name": "Temperature_Max",
                    "role": "value.temperature.max.forecast.0",
                    "type": "number",
                    "unit": "�C",
                    "read": true,
                    "write": false,
                    "desc": "Maximum temperature",
                    "custom": {
                        "minmax.0": {
                            "enabled": true,
                            "logName": "MinMaxTemp"
                        }
                    }
                },
                "native": {
                    "id": "location_1.ForecastDaily.Day_1.Temperature_Max"
                },
                "_id": "daswetter.0.location_1.ForecastDaily.Day_1.Temperature_Max",
                "acl": {
                    "object": 1636,
                    "state": 1636,
                    "owner": "system.user.admin",
                    "ownerGroup": "system.group.administrator"
                },
                "from": "system.adapter.admin.0",
                "user": "system.user.admin",
                "ts": 1792170762861
            }
            */
        }
        else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }
    /**
     * Is called if a subscribed state changes
     */
    async onStateChange(id, state) {
        try {
            await this.minmaxController?.handleStateChange(id, state);
        }
        catch (error) {
            this.log.error(`Failed to process state change for ${id}: ${(0, error_utils_1.describeError)(error)}`);
        }
    }
    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  */
    onMessage(obj) {
        if (typeof obj === "object" && obj.command) {
            this.log.warn("got unknown message: " + obj.command + " / " + obj.message + " from " + obj.from);
        }
        else {
            this.log.warn("got invalid message object " + JSON.stringify(obj));
        }
    }
}
exports.Minmax = Minmax;
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new Minmax(options);
}
else {
    // otherwise start the instance directly
    (() => new Minmax())();
}
//# sourceMappingURL=main.js.map